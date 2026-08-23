import type { Subscription } from "@/lib/types";
import { monthlyEquivalent, formatMoney } from "@/lib/money";
import { findService } from "@/lib/catalog";
import { ServiceLogo } from "./ServiceLogo";
import { SubRow } from "./SubRow";

export function groupSubs(subs: Subscription[]): Subscription[][] {
  const order: string[] = [];
  const byKey = new Map<string, Subscription[]>();
  for (const s of subs) {
    const key = s.catalog_id ?? s.name.toLowerCase();
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key)!.push(s);
  }
  return order.map((k) => byKey.get(k)!);
}

export function SubGroup({ subs }: { subs: Subscription[] }) {
  if (subs.length === 1) return <SubRow sub={subs[0]} />;

  const first = subs[0];
  const domain = first.catalog_id
    ? findService(first.catalog_id)?.domain
    : undefined;
  const monthly = subs.reduce(
    (sum, s) => sum + monthlyEquivalent(s.price, s.cycle, s.cycle_custom_days),
    0
  );

  return (
    <div className="sub-group">
      <div className="sub-group-header">
        <ServiceLogo name={first.name} domain={domain} size={30} />
        <span className="name">{first.name}</span>
        <span className="meta">
          {subs.length} subscriptions · {formatMoney(monthly)}/mo combined
        </span>
      </div>
      <div className="sub-group-rows">
        {subs.map((s) => (
          <SubRow key={s.id} sub={s} compact />
        ))}
      </div>
    </div>
  );
}
