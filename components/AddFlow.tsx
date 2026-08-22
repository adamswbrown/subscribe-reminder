"use client";

import { useMemo, useState } from "react";
import {
  CATALOG,
  categoryLabel,
  type CatalogService,
} from "@/lib/catalog";
import { SubscriptionForm } from "./SubscriptionForm";
import { ServiceLogo } from "./ServiceLogo";

export function AddFlow({
  action,
  justAdded,
}: {
  action: (form: FormData) => Promise<void>;
  justAdded?: boolean;
}) {
  const [selected, setSelected] = useState<CatalogService | null>(null);
  const [custom, setCustom] = useState(false);
  const [search, setSearch] = useState("");

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? CATALOG.filter((s) => s.name.toLowerCase().includes(q))
      : CATALOG;
    const map = new Map<string, CatalogService[]>();
    for (const s of filtered) {
      const list = map.get(s.category) ?? [];
      list.push(s);
      map.set(s.category, list);
    }
    return [...map.entries()];
  }, [search]);

  if (custom) {
    return (
      <>
        <button className="btn-small" onClick={() => setCustom(false)}>
          ← back to the picker
        </button>
        <h1 style={{ fontSize: "1.3rem" }}>Add a custom subscription</h1>
        <SubscriptionForm
          initial={{ intent: "review" }}
          action={action}
          submitLabel="Add subscription"
          showAddAnother
        />
      </>
    );
  }

  if (selected) {
    const defaultPrice =
      selected.typical_price ?? selected.plans?.[0]?.typical_price;
    return (
      <>
        <button className="btn-small" onClick={() => setSelected(null)}>
          ← back to the picker
        </button>
        <h1
          style={{
            fontSize: "1.3rem",
            display: "flex",
            alignItems: "center",
            gap: "0.55rem",
          }}
        >
          <ServiceLogo name={selected.name} domain={selected.domain} size={28} />
          Add {selected.name}
        </h1>
        {selected.notes && <p className="muted">{selected.notes}</p>}
        <SubscriptionForm
          initial={{
            catalog_id: selected.id,
            name: selected.name,
            category: selected.category,
            plan_label: selected.plans?.[0]?.label ?? null,
            price: defaultPrice,
            cycle: selected.default_cycle,
            notice_period_days: selected.notice_period_days,
            cancel_method: selected.cancel_method,
            intent: "review",
          }}
          plans={selected.plans}
          action={action}
          submitLabel="Add subscription"
          showAddAnother
        />
      </>
    );
  }

  return (
    <>
      <h1 style={{ fontSize: "1.3rem" }}>What are you subscribed to?</h1>
      {justAdded && <div className="notice">Added ✓ — pick the next one.</div>}
      <div className="field">
        <input
          placeholder="Search services…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {grouped.map(([category, services]) => (
        <div key={category}>
          <h2 className="section">{categoryLabel(category)}</h2>
          <div className="chip-grid">
            {services.map((s) => (
              <button
                key={s.id}
                className="chip"
                onClick={() => setSelected(s)}
              >
                <ServiceLogo name={s.name} domain={s.domain} size={18} />
                {s.name}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="chip-grid">
        <button className="chip" onClick={() => setCustom(true)}>
          + Something else…
        </button>
      </div>
    </>
  );
}
