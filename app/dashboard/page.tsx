import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Subscription } from "@/lib/types";
import {
  monthlyEquivalent,
  formatMoney,
  cycleLabel,
  daysUntil,
} from "@/lib/money";
import { categoryLabel } from "@/lib/catalog";
import { SubRow } from "@/components/SubRow";
import { SubGroup, groupSubs } from "@/components/SubGroup";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("*")
    .order("action_deadline", { ascending: true });

  const subs = (data ?? []) as Subscription[];
  const active = subs.filter((s) => s.state === "active");
  const cancelled = subs.filter((s) => s.state === "cancelled");

  const monthly = active.reduce(
    (sum, s) => sum + monthlyEquivalent(s.price, s.cycle, s.cycle_custom_days),
    0
  );
  const saving = cancelled.reduce(
    (sum, s) => sum + monthlyEquivalent(s.price, s.cycle, s.cycle_custom_days),
    0
  );

  const needsAction = active.filter((s) => s.intent !== "keep");
  const keeping = active.filter((s) => s.intent === "keep");

  const upcoming = active
    .filter((s) => daysUntil(s.next_renewal_date) <= 30)
    .sort((a, b) => a.next_renewal_date.localeCompare(b.next_renewal_date));
  const upcomingTotal = upcoming.reduce((sum, s) => sum + s.price, 0);

  const byCategory = new Map<string, number>();
  for (const s of active) {
    byCategory.set(
      s.category,
      (byCategory.get(s.category) ?? 0) +
        monthlyEquivalent(s.price, s.cycle, s.cycle_custom_days)
    );
  }
  const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);

  if (subs.length === 0) {
    return (
      <main>
        <div className="card" style={{ textAlign: "center", padding: "3rem 1rem" }}>
          <h1 style={{ marginTop: 0 }}>Let&apos;s find your subscriptions</h1>
          <p style={{ color: "var(--text-dim)" }}>
            Pick from common services — Netflix, Spotify, your gym, your
            broadband — and we&apos;ll keep an eye on the dates that matter.
          </p>
          <div
            style={{ display: "flex", gap: "0.6rem", justifyContent: "center" }}
          >
            <Link href="/dashboard/add" className="btn btn-primary">
              Add your first subscription
            </Link>
            <Link href="/dashboard/import" className="btn">
              Import from screenshots or CSV
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="stat-row">
        <div className="stat">
          <div className="label">Per month</div>
          <div className="value">{formatMoney(monthly)}</div>
        </div>
        <div className="stat">
          <div className="label">Per year</div>
          <div className="value">{formatMoney(monthly * 12)}</div>
        </div>
        <div className="stat">
          <div className="label">Active</div>
          <div className="value">{active.length}</div>
        </div>
        {saving > 0 && (
          <div className="stat">
            <div className="label">Saving (cancelled)</div>
            <div className="value" style={{ color: "var(--good)" }}>
              {formatMoney(saving)}/mo
            </div>
          </div>
        )}
      </div>

      {needsAction.length > 0 && (
        <>
          <h2 className="section">Needs a decision</h2>
          <div className="sub-list">
            {groupSubs(needsAction).map((group) => (
              <SubGroup key={group[0].id} subs={group} />
            ))}
          </div>
        </>
      )}

      {keeping.length > 0 && (
        <>
          <h2 className="section">Keeping</h2>
          <div className="sub-list">
            {groupSubs(keeping).map((group) => (
              <SubGroup key={group[0].id} subs={group} />
            ))}
          </div>
        </>
      )}

      {upcoming.length > 0 && (
        <>
          <h2 className="section">
            Next 30 days — {formatMoney(upcomingTotal)} leaving your account
          </h2>
          <div className="card">
            {upcoming.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "0.3rem 0",
                  fontSize: "0.9rem",
                }}
              >
                <span>
                  <span style={{ color: "var(--text-faint)" }}>
                    {new Date(
                      s.next_renewal_date + "T00:00:00"
                    ).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>{" "}
                  {s.name}
                </span>
                <span>{formatMoney(s.price, s.currency)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {categories.length > 1 && (
        <>
          <h2 className="section">By category</h2>
          <div className="card">
            {categories.map(([cat, amount]) => (
              <div
                key={cat}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "0.3rem 0",
                  fontSize: "0.9rem",
                }}
              >
                <span>{categoryLabel(cat)}</span>
                <span>{formatMoney(amount)}/mo</span>
              </div>
            ))}
          </div>
        </>
      )}

      {cancelled.length > 0 && (
        <>
          <h2 className="section">Cancelled</h2>
          <div className="sub-list">
            {cancelled.map((s) => (
              <div className="sub-row" key={s.id} style={{ opacity: 0.65 }}>
                <span className="name">{s.name}</span>
                <span className="meta">
                  was {formatMoney(s.price, s.currency)}
                  {cycleLabel(s.cycle, s.cycle_custom_days)}
                </span>
                <span className="spacer" />
                <span className="badge">
                  cancelled {s.cancelled_effective ?? ""}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
