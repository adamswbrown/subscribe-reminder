"use client";

import { useState } from "react";
import type { CatalogPlan } from "@/lib/catalog";

export interface FormInitial {
  catalog_id?: string | null;
  name?: string;
  category?: string;
  plan_label?: string | null;
  price?: number;
  cycle?: string;
  cycle_custom_days?: number | null;
  next_renewal_date?: string;
  renewal_confidence?: string;
  intent?: string;
  trial_end_date?: string | null;
  contract_end_date?: string | null;
  intro_price?: number | null;
  intro_ends?: string | null;
  notice_period_days?: number;
  cancel_method?: string;
  cancel_url?: string | null;
  notes?: string | null;
}

const CATEGORIES = [
  "streaming",
  "music",
  "news",
  "gaming",
  "gym",
  "broadband",
  "mobile",
  "utilities",
  "storage",
  "software",
  "books",
  "food",
  "insurance",
  "bundle",
  "other",
];

export function SubscriptionForm({
  initial,
  plans,
  action,
  submitLabel,
  showAddAnother,
}: {
  initial: FormInitial;
  plans?: CatalogPlan[];
  action: (form: FormData) => Promise<void>;
  submitLabel: string;
  showAddAnother?: boolean;
}) {
  const [price, setPrice] = useState<string>(
    initial.price != null ? String(initial.price) : ""
  );
  const [planLabel, setPlanLabel] = useState<string>(initial.plan_label ?? "");
  const [cycle, setCycle] = useState<string>(initial.cycle ?? "monthly");
  const [notSure, setNotSure] = useState(
    initial.renewal_confidence === "unknown"
  );
  const [oneMonth, setOneMonth] = useState(false);
  const [intent, setIntent] = useState(initial.intent ?? "review");

  function pickPlan(label: string) {
    setPlanLabel(label);
    const plan = plans?.find((p) => p.label === label);
    if (plan) {
      setPrice(String(plan.typical_price));
      if (plan.cycle) setCycle(plan.cycle);
    }
  }

  return (
    <form action={action} className="card">
      <input type="hidden" name="catalog_id" value={initial.catalog_id ?? ""} />
      <div className="form-grid">
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" name="name" required defaultValue={initial.name} />
        </div>
        <div className="field">
          <label htmlFor="category">Category</label>
          <select
            id="category"
            name="category"
            defaultValue={initial.category ?? "other"}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        {plans && plans.length > 0 ? (
          <div className="field">
            <label htmlFor="plan_label">Plan</label>
            <select
              id="plan_label"
              name="plan_label"
              value={planLabel}
              onChange={(e) => pickPlan(e.target.value)}
            >
              <option value="">— pick a plan —</option>
              {plans.map((p) => (
                <option key={p.label} value={p.label}>
                  {p.label} (~£{p.typical_price})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="plan_label">Plan / tier (optional)</label>
            <input
              id="plan_label"
              name="plan_label"
              value={planLabel}
              onChange={(e) => setPlanLabel(e.target.value)}
            />
          </div>
        )}
        <div className="field">
          <label htmlFor="price">Price (£)</label>
          <input
            id="price"
            name="price"
            type="number"
            step="0.01"
            min="0"
            required
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="cycle">Billing cycle</label>
          <select
            id="cycle"
            name="cycle"
            value={cycle}
            onChange={(e) => setCycle(e.target.value)}
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        {cycle === "custom" && (
          <div className="field">
            <label htmlFor="cycle_custom_days">Every how many days?</label>
            <input
              id="cycle_custom_days"
              name="cycle_custom_days"
              type="number"
              min="1"
              defaultValue={initial.cycle_custom_days ?? 30}
            />
          </div>
        )}
        <div className="field">
          <label htmlFor="next_renewal_date">Next renewal date</label>
          <input
            id="next_renewal_date"
            name="next_renewal_date"
            type="date"
            disabled={notSure}
            defaultValue={initial.next_renewal_date}
          />
          <label
            style={{
              display: "flex",
              gap: "0.4rem",
              alignItems: "center",
              marginTop: "0.35rem",
            }}
          >
            <input
              type="checkbox"
              name="renewal_not_sure"
              style={{ width: "auto" }}
              checked={notSure}
              onChange={(e) => setNotSure(e.target.checked)}
            />
            Not sure — remind me to check
          </label>
        </div>
      </div>

      <div className="field">
        <label>What&apos;s your intent?</label>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {[
            ["keep", "Keep it"],
            ["cancel", "Cancel before it renews"],
            ["review", "Not sure — remind me to decide"],
          ].map(([value, label]) => (
            <label
              key={value}
              className={`chip ${intent === value && !oneMonth ? "selected" : ""}`}
              style={{ display: "inline-flex", gap: "0.4rem" }}
            >
              <input
                type="radio"
                name="intent"
                value={value}
                checked={intent === value}
                onChange={() => setIntent(value)}
                style={{ display: "none" }}
              />
              {label}
            </label>
          ))}
        </div>
        <label
          style={{
            display: "flex",
            gap: "0.4rem",
            alignItems: "center",
            marginTop: "0.5rem",
          }}
        >
          <input
            type="checkbox"
            name="one_month"
            style={{ width: "auto" }}
            checked={oneMonth}
            onChange={(e) => {
              setOneMonth(e.target.checked);
              if (e.target.checked) setIntent("cancel");
            }}
          />
          I&apos;m just taking it for a month — remind me to cancel
        </label>
      </div>

      <details style={{ marginBottom: "1rem" }}>
        <summary style={{ cursor: "pointer", color: "var(--text-dim)" }}>
          More options — trials, contracts, notice periods
        </summary>
        <div className="form-grid" style={{ marginTop: "0.75rem" }}>
          <div className="field">
            <label htmlFor="trial_end_date">Free trial ends</label>
            <input
              id="trial_end_date"
              name="trial_end_date"
              type="date"
              defaultValue={initial.trial_end_date ?? undefined}
            />
          </div>
          <div className="field">
            <label htmlFor="contract_end_date">
              Contract / minimum term ends
            </label>
            <input
              id="contract_end_date"
              name="contract_end_date"
              type="date"
              defaultValue={initial.contract_end_date ?? undefined}
            />
          </div>
          <div className="field">
            <label htmlFor="intro_price">Intro price (£, if different)</label>
            <input
              id="intro_price"
              name="intro_price"
              type="number"
              step="0.01"
              min="0"
              defaultValue={initial.intro_price ?? undefined}
            />
          </div>
          <div className="field">
            <label htmlFor="intro_ends">Intro price ends</label>
            <input
              id="intro_ends"
              name="intro_ends"
              type="date"
              defaultValue={initial.intro_ends ?? undefined}
            />
          </div>
          <div className="field">
            <label htmlFor="notice_period_days">
              Cancellation notice (days)
            </label>
            <input
              id="notice_period_days"
              name="notice_period_days"
              type="number"
              min="0"
              defaultValue={initial.notice_period_days ?? 0}
            />
          </div>
          <div className="field">
            <label htmlFor="cancel_method">How do you cancel?</label>
            <select
              id="cancel_method"
              name="cancel_method"
              defaultValue={initial.cancel_method ?? "website"}
            >
              <option value="website">Website</option>
              <option value="in_app">In app</option>
              <option value="phone">Phone</option>
              <option value="letter">Letter / written notice</option>
              <option value="varies">Varies</option>
            </select>
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              defaultValue={initial.notes ?? undefined}
            />
          </div>
        </div>
      </details>

      <div style={{ display: "flex", gap: "0.6rem" }}>
        <button type="submit" className="btn-primary">
          {submitLabel}
        </button>
        {showAddAnother && (
          <button type="submit" name="add_another" value="true">
            Save &amp; add another
          </button>
        )}
      </div>
    </form>
  );
}
