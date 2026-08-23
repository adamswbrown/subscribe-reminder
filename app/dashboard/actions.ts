"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/money";
import { findService } from "@/lib/catalog";
import { CYCLE_DAYS, type ImportSuggestion } from "@/lib/importTypes";

function str(form: FormData, key: string): string | null {
  const v = form.get(key);
  if (typeof v !== "string" || v.trim() === "") return null;
  return v.trim();
}

function num(form: FormData, key: string): number | null {
  const v = str(form, key);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function subscriptionFromForm(form: FormData) {
  const notSure = form.get("renewal_not_sure") === "on";
  const oneMonth = form.get("one_month") === "on";
  let nextRenewal = str(form, "next_renewal_date");
  let fabricated = false;
  if (!nextRenewal) {
    // Default: first of next month (UK calendar), always flagged low-confidence
    fabricated = true;
    const [y, m] = todayISO().split("-").map(Number);
    nextRenewal = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  }
  const intent = oneMonth ? "cancel" : (str(form, "intent") ?? "review");

  return {
    catalog_id: str(form, "catalog_id"),
    name: str(form, "name") ?? "Subscription",
    category: str(form, "category") ?? "other",
    plan_label: str(form, "plan_label"),
    price: num(form, "price") ?? 0,
    currency: "GBP",
    cycle: str(form, "cycle") ?? "monthly",
    cycle_custom_days: num(form, "cycle_custom_days"),
    next_renewal_date: nextRenewal,
    renewal_confidence: notSure || fabricated ? "unknown" : "exact",
    intent,
    trial_end_date: str(form, "trial_end_date"),
    contract_end_date: str(form, "contract_end_date"),
    intro_price: num(form, "intro_price"),
    intro_ends: str(form, "intro_ends"),
    notice_period_days: num(form, "notice_period_days") ?? 0,
    cancel_method: str(form, "cancel_method") ?? "website",
    cancel_url: str(form, "cancel_url"),
    notes: str(form, "notes"),
  };
}

export async function addSubscription(form: FormData) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("subscriptions")
    .insert({ ...subscriptionFromForm(form), user_id: user.id });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  if (form.get("add_another") === "true") {
    redirect("/dashboard/add?added=1");
  }
  redirect("/dashboard");
}

export async function updateSubscription(id: string, form: FormData) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("subscriptions")
    .update(subscriptionFromForm(form))
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function setIntent(id: string, intent: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("subscriptions")
    .update({ intent })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function markCancelled(id: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("subscriptions")
    .update({
      state: "cancelled",
      cancelled_effective: todayISO(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function reactivate(id: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("subscriptions")
    .update({ state: "active", cancelled_effective: null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function addSubscriptionsBulk(suggestions: ImportSuggestion[]) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rows = suggestions.slice(0, 50).map((s) => {
    const service = s.catalog_id ? findService(s.catalog_id) : undefined;
    const cycle = s.cycle ?? "monthly";
    let nextRenewal = s.next_renewal_date;
    let confidence = "approximate";
    if (!nextRenewal && s.last_charged) {
      const last = Date.parse(s.last_charged + "T00:00:00Z");
      if (Number.isFinite(last)) {
        const days =
          CYCLE_DAYS[cycle as keyof typeof CYCLE_DAYS] ?? CYCLE_DAYS.monthly;
        nextRenewal = new Date(last + days * 86400000)
          .toISOString()
          .slice(0, 10);
      }
    }
    if (!nextRenewal) {
      const [y, m] = todayISO().split("-").map(Number);
      nextRenewal = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
      confidence = "unknown";
    }
    return {
      user_id: user.id,
      catalog_id: service?.id ?? null,
      name: (s.name || service?.name || "Subscription").slice(0, 120),
      category: s.category ?? service?.category ?? "other",
      plan_label: s.plan_label,
      price: Math.max(0, Number(s.price) || 0),
      currency: "GBP",
      cycle,
      next_renewal_date: nextRenewal,
      renewal_confidence: confidence,
      intent: "review",
      notice_period_days: service?.notice_period_days ?? 0,
      cancel_method: service?.cancel_method ?? "website",
    };
  });
  if (rows.length === 0) return;

  const { error } = await supabase.from("subscriptions").insert(rows);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function hasPushSubscription(endpoint: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("push_subscriptions")
    .select("endpoint")
    .eq("endpoint", endpoint)
    .maybeSingle();
  return data !== null;
}

export async function snoozeReminders(id: string, days: number) {
  const supabase = await createSupabaseServerClient();
  const [y, m, d] = todayISO().split("-").map(Number);
  const until = new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  const { error } = await supabase
    .from("subscriptions")
    .update({ reminders_snoozed_until: until })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function savePushSubscription(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
    { onConflict: "endpoint" }
  );
  if (error) throw new Error(error.message);
}

export async function removePushSubscription(endpoint: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);
  if (error) throw new Error(error.message);
}

export type BulkAction =
  | "keep"
  | "cancel"
  | "review"
  | "snooze"
  | "mark_cancelled"
  | "reactivate"
  | "delete";

export async function bulkAction(ids: string[], action: BulkAction) {
  if (ids.length === 0) return;
  const supabase = await createSupabaseServerClient();
  // RLS scopes every statement to the caller's own rows.
  const targets = supabase.from("subscriptions");
  let error: { message: string } | null = null;

  if (action === "delete") {
    ({ error } = await targets.delete().in("id", ids));
  } else if (action === "mark_cancelled") {
    ({ error } = await targets
      .update({ state: "cancelled", cancelled_effective: todayISO() })
      .in("id", ids));
  } else if (action === "reactivate") {
    ({ error } = await targets
      .update({ state: "active", cancelled_effective: null })
      .in("id", ids));
  } else if (action === "snooze") {
    const [y, m, d] = todayISO().split("-").map(Number);
    const until = new Date(Date.UTC(y, m - 1, d + 3)).toISOString().slice(0, 10);
    ({ error } = await targets
      .update({ reminders_snoozed_until: until })
      .in("id", ids));
  } else {
    ({ error } = await targets.update({ intent: action }).in("id", ids));
  }
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function changeEmail(form: FormData) {
  const email = str(form, "email");
  if (!email || !email.includes("@")) {
    redirect("/dashboard/settings?email_error=1");
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ email });
  if (error) redirect("/dashboard/settings?email_error=1");
  redirect("/dashboard/settings?email_sent=1");
}

export async function deleteAccount() {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_account");
  if (error) throw new Error(error.message);
  await supabase.auth.signOut();
  redirect("/login?account_deleted=1");
}

export async function deleteSubscription(id: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("subscriptions").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}
