import { createClient } from "@supabase/supabase-js";

interface FeedEvent {
  sub_id: string;
  sub_name: string;
  event_kind: string;
  event_date: string;
  price: number;
  currency: string;
  intent: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

// RFC 5545 §3.1: content lines longer than 75 octets should be folded with
// CRLF followed by a single space.
const encoder = new TextEncoder();
function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const segments: string[] = [];
  let current = "";
  let currentOctets = 0;
  for (const ch of line) {
    const chOctets = encoder.encode(ch).length;
    const limit = segments.length === 0 ? 75 : 74; // continuations start with a space
    if (currentOctets + chOctets > limit) {
      segments.push(current);
      current = ch;
      currentOctets = chOctets;
    } else {
      current += ch;
      currentOctets += chOctets;
    }
  }
  segments.push(current);
  return segments.join("\r\n ");
}

function eventTitle(e: FeedEvent): string {
  const price = `£${Number(e.price).toFixed(2)}`;
  switch (e.event_kind) {
    case "cancel_deadline":
      return `⚠️ Last day to cancel ${e.sub_name}`;
    case "renewal":
      return e.intent === "cancel"
        ? `${e.sub_name} renews (${price}) — you planned to cancel`
        : `${e.sub_name} renews (${price})`;
    case "trial_end":
      return `${e.sub_name} free trial ends`;
    case "contract_end":
      return `${e.sub_name} contract ends — renegotiate`;
    case "intro_end":
      return `${e.sub_name} intro price ends`;
    default:
      return e.sub_name;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/, "");
  if (!UUID_RE.test(token)) {
    return new Response("Not found", { status: 404 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
  const { data, error } = await supabase.rpc("calendar_feed", {
    p_token: token,
  });
  if (error) {
    return new Response("Feed error", { status: 500 });
  }
  const events = (data ?? []) as FeedEvent[];

  const now = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//subscribe-reminder//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Subscriptions",
  ];

  for (const e of events) {
    const date = e.event_date.replace(/-/g, "");
    const uid = `${e.event_kind}-${date}-${e.sub_id}@subscribe-reminder`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${date}`,
      `SUMMARY:${icsEscape(eventTitle(e))}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${icsEscape(eventTitle(e))}`,
      "TRIGGER:-PT15H",
      "END:VALARM",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");

  return new Response(lines.map(foldLine).join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=900",
    },
  });
}
