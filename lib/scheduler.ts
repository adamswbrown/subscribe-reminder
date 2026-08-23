import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

interface DueReminder {
  id: number;
  user_id: string;
  email: string;
  sub_name: string;
  kind: string;
  event_date: string;
  price: number;
  notice_period_days: number;
}

interface PushTarget {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const HOUR = 60 * 60 * 1000;
let running = false;

function subject(r: DueReminder): string {
  switch (r.kind) {
    case "cancel_deadline":
      return `⚠️ Cancel ${r.sub_name} by ${r.event_date}`;
    case "trial_ending":
      return `${r.sub_name} free trial ends ${r.event_date}`;
    case "renewal_heads_up":
      return `${r.sub_name} renews ${r.event_date} (£${Number(r.price).toFixed(2)})`;
    case "decide_nudge":
      return `Decide on ${r.sub_name} — it renews ${r.event_date}`;
    case "contract_cliff":
      return `${r.sub_name} contract ends ${r.event_date} — time to renegotiate`;
    case "intro_price_ending":
      return `${r.sub_name} intro price ends ${r.event_date}`;
    default:
      return `Reminder: ${r.sub_name}`;
  }
}

function body(r: DueReminder): string {
  const lines = [subject(r)];
  if (r.kind === "cancel_deadline" && r.notice_period_days > 0) {
    lines.push(
      `This service needs ${r.notice_period_days} days' notice, so today is about acting, not the renewal date.`
    );
  }
  lines.push("", "Open your dashboard to act or snooze:", appUrl());
  return lines.join("\n");
}

function appUrl(): string {
  // APP_URL is the site origin; tolerate a trailing slash or /dashboard path.
  const base = (
    process.env.APP_URL ?? "https://web-production-b24d64.up.railway.app"
  )
    .replace(/\/+$/, "")
    .replace(/\/dashboard$/, "");
  return `${base}/dashboard`;
}

async function sendEmail(to: string, subj: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "subscribe-reminder <onboarding@resend.dev>";
  if (!key) {
    console.log(`[scheduler] (no RESEND_API_KEY) would email ${to}: ${subj}`);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject: subj, text }),
  });
  if (!res.ok) {
    console.error(`[scheduler] email send failed: ${res.status} ${await res.text()}`);
    return false;
  }
  return true;
}

// Returns the reminder ids that reached at least one push endpoint.
async function sendPushes(
  supabase: SupabaseClient,
  secret: string,
  due: DueReminder[]
): Promise<Set<number>> {
  const delivered = new Set<number>();
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv || due.length === 0) return delivered;
  // VAPID subject is the operator contact; default to our own origin.
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? appUrl().replace(/\/dashboard$/, ""),
    pub,
    priv
  );

  const userIds = [...new Set(due.map((r) => r.user_id))];
  const { data, error } = await supabase.rpc("get_push_subscriptions", {
    p_secret: secret,
    p_user_ids: userIds,
  });
  if (error) {
    console.error("[scheduler] get_push_subscriptions failed:", error.message);
    return delivered;
  }
  const targets = (data ?? []) as PushTarget[];
  if (targets.length === 0) return delivered;

  const byUser = new Map<string, PushTarget[]>();
  for (const t of targets) {
    const list = byUser.get(t.user_id) ?? [];
    list.push(t);
    byUser.set(t.user_id, list);
  }

  let sent = 0;
  for (const r of due) {
    for (const t of byUser.get(r.user_id) ?? []) {
      try {
        await webpush.sendNotification(
          {
            endpoint: t.endpoint,
            keys: { p256dh: t.p256dh, auth: t.auth },
          },
          JSON.stringify({ title: subject(r), url: appUrl() })
        );
        sent++;
        delivered.add(r.id);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await supabase.rpc("delete_push_subscription", {
            p_secret: secret,
            p_endpoint: t.endpoint,
          });
          byUser.set(
            t.user_id,
            (byUser.get(t.user_id) ?? []).filter(
              (x) => x.endpoint !== t.endpoint
            )
          );
        } else {
          console.error("[scheduler] push send failed:", status ?? err);
        }
      }
    }
  }
  if (sent > 0) console.log(`[scheduler] sent ${sent} push notification(s)`);
  return delivered;
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    );

    // Advance lapsed renewal dates and un-pause expired freezes (idempotent).
    const { error: advErr } = await supabase.rpc("tick_advance");
    if (advErr) console.error("[scheduler] tick_advance failed:", advErr.message);

    const secret = process.env.CRON_SECRET;
    if (!secret) {
      console.log("[scheduler] CRON_SECRET not set — skipping email reminders");
      return;
    }

    const { data, error } = await supabase.rpc("due_notifications", {
      p_secret: secret,
    });
    if (error) {
      console.error("[scheduler] due_notifications failed:", error.message);
      return;
    }

    const due = (data ?? []) as DueReminder[];
    const pushed = await sendPushes(supabase, secret, due);
    // A reminder is done once ANY channel delivered it — otherwise a
    // missing/failing email sender makes pushes repeat every tick. With no
    // channel configured at all, log once and mark done rather than loop.
    const noChannel =
      !process.env.RESEND_API_KEY && !process.env.VAPID_PRIVATE_KEY;
    const sentIds: number[] = [];
    for (const r of due) {
      const emailOk = await sendEmail(r.email, subject(r), body(r));
      if (emailOk || pushed.has(r.id) || noChannel) sentIds.push(r.id);
    }
    if (sentIds.length > 0) {
      const { error: markErr } = await supabase.rpc("mark_reminders_sent", {
        p_secret: secret,
        p_ids: sentIds,
      });
      if (markErr)
        console.error("[scheduler] mark_reminders_sent failed:", markErr.message);
      console.log(`[scheduler] sent ${sentIds.length} reminder email(s)`);
    }
  } catch (err) {
    console.error("[scheduler] tick error:", err);
  } finally {
    running = false;
  }
}

export function startScheduler() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.log("[scheduler] Supabase env not configured — scheduler disabled");
    return;
  }
  console.log("[scheduler] started — hourly tick");
  setTimeout(tick, 30 * 1000);
  setInterval(tick, HOUR);
}
