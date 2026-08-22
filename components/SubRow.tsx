import Link from "next/link";
import type { Subscription } from "@/lib/types";
import { formatMoney, cycleLabel, daysUntil } from "@/lib/money";
import { setIntent, markCancelled } from "@/app/dashboard/actions";

function DeadlineChip({ sub }: { sub: Subscription }) {
  const days = daysUntil(sub.action_deadline);
  const renewDays = daysUntil(sub.next_renewal_date);
  let cls = "deadline";
  let text: string;

  if (sub.intent === "cancel") {
    if (days < 0) text = "deadline passed — did you cancel?";
    else if (days === 0) text = "⚠️ last day to cancel";
    else text = `cancel by ${sub.action_deadline} (${days}d)`;
    if (days <= 1) cls += " urgent";
    else if (days <= 3) cls += " soon";
  } else {
    text =
      renewDays === 0
        ? "renews today"
        : renewDays < 0
          ? "renewal date passed"
          : `renews in ${renewDays}d`;
    if (sub.intent === "review" && renewDays <= 5) cls += " soon";
  }
  return <span className={cls}>{text}</span>;
}

export function SubRow({ sub }: { sub: Subscription }) {
  const setKeep = setIntent.bind(null, sub.id, "keep");
  const setCancel = setIntent.bind(null, sub.id, "cancel");
  const setReview = setIntent.bind(null, sub.id, "review");
  const cancelled = markCancelled.bind(null, sub.id);

  return (
    <div className="sub-row">
      <div>
        <div className="name">
          {sub.name}
          {sub.plan_label ? (
            <span className="meta"> · {sub.plan_label}</span>
          ) : null}
        </div>
        <div className="meta">
          {formatMoney(sub.price, sub.currency)}
          {cycleLabel(sub.cycle, sub.cycle_custom_days)}
          {sub.notice_period_days > 0 &&
            ` · ${sub.notice_period_days}d notice`}
        </div>
      </div>
      <span className={`badge ${sub.intent}`}>{sub.intent}</span>
      <DeadlineChip sub={sub} />
      <span className="spacer" />
      <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
        {sub.intent !== "keep" && (
          <form action={setKeep}>
            <button className="btn-small" title="Keep this subscription">
              keep
            </button>
          </form>
        )}
        {sub.intent !== "cancel" && (
          <form action={setCancel}>
            <button
              className="btn-small btn-danger"
              title="Remind me to cancel before it renews"
            >
              cancel…
            </button>
          </form>
        )}
        {sub.intent !== "review" && (
          <form action={setReview}>
            <button className="btn-small" title="Remind me to decide">
              review
            </button>
          </form>
        )}
        {sub.intent === "cancel" && (
          <form action={cancelled}>
            <button
              className="btn-small"
              style={{ color: "var(--good)" }}
              title="I've cancelled it"
            >
              done ✓
            </button>
          </form>
        )}
        <Link className="btn btn-small" href={`/dashboard/edit/${sub.id}`}>
          edit
        </Link>
      </div>
    </div>
  );
}
