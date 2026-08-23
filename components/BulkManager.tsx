"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Subscription } from "@/lib/types";
import type { BulkAction } from "@/app/dashboard/actions";
import { formatMoney, cycleLabel } from "@/lib/money";

export function BulkManager({
  subs,
  act,
}: {
  subs: Subscription[];
  act: (ids: string[], action: BulkAction) => Promise<void>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = subs.filter((s) => s.state === "active");
  const cancelled = subs.filter((s) => s.state === "cancelled");
  const anyCancelledSelected = cancelled.some((s) => selected.has(s.id));

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    setConfirmDelete(false);
  }

  function selectAll(list: Subscription[]) {
    const ids = list.map((s) => s.id);
    const allIn = ids.every((id) => selected.has(id));
    const next = new Set(selected);
    for (const id of ids) {
      if (allIn) next.delete(id);
      else next.add(id);
    }
    setSelected(next);
    setConfirmDelete(false);
  }

  async function run(action: BulkAction) {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await act([...selected], action);
      setSelected(new Set());
      setConfirmDelete(false);
      router.refresh();
    } catch {
      setError("That didn't save — try again.");
    } finally {
      setBusy(false);
    }
  }

  function row(s: Subscription) {
    return (
      <label className="sub-row" key={s.id} style={{ cursor: "pointer" }}>
        <input
          type="checkbox"
          style={{ width: "auto" }}
          checked={selected.has(s.id)}
          onChange={() => toggle(s.id)}
        />
        <div>
          <div className="name">
            {s.name}
            {s.plan_label ? <span className="meta"> · {s.plan_label}</span> : null}
          </div>
          <div className="meta">
            {formatMoney(s.price, s.currency)}
            {cycleLabel(s.cycle, s.cycle_custom_days)}
            {s.state === "active" ? ` · renews ${s.next_renewal_date}` : ""}
          </div>
        </div>
        <span className="spacer" />
        <span className={`badge ${s.state === "cancelled" ? "" : s.intent}`}>
          {s.state === "cancelled" ? "cancelled" : s.intent}
        </span>
      </label>
    );
  }

  return (
    <>
      <div
        className="card"
        style={{
          position: "sticky",
          top: "0.5rem",
          zIndex: 5,
          display: "flex",
          gap: "0.4rem",
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: "1rem",
        }}
      >
        <span className="meta" style={{ minWidth: "6.5rem" }}>
          {selected.size} selected
        </span>
        <button className="btn-small" disabled={busy || selected.size === 0} onClick={() => run("keep")}>
          keep
        </button>
        <button className="btn-small" disabled={busy || selected.size === 0} onClick={() => run("cancel")}>
          cancel…
        </button>
        <button className="btn-small" disabled={busy || selected.size === 0} onClick={() => run("review")}>
          review
        </button>
        <button className="btn-small" disabled={busy || selected.size === 0} onClick={() => run("snooze")}>
          snooze 3d
        </button>
        <button className="btn-small" disabled={busy || selected.size === 0} onClick={() => run("mark_cancelled")}>
          cancelled ✓
        </button>
        {anyCancelledSelected && (
          <button className="btn-small" disabled={busy} onClick={() => run("reactivate")}>
            reactivate
          </button>
        )}
        {confirmDelete ? (
          <button
            className="btn-small btn-danger"
            disabled={busy}
            onClick={() => run("delete")}
          >
            {busy ? "…" : `really delete ${selected.size}?`}
          </button>
        ) : (
          <button
            className="btn-small btn-danger"
            disabled={busy || selected.size === 0}
            onClick={() => setConfirmDelete(true)}
          >
            delete
          </button>
        )}
        {error && <span style={{ color: "var(--danger)" }}>{error}</span>}
      </div>

      {active.length > 0 && (
        <>
          <h2 className="section" style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            Active
            <button className="btn-small" onClick={() => selectAll(active)}>
              all / none
            </button>
          </h2>
          <div className="sub-list">{active.map(row)}</div>
        </>
      )}

      {cancelled.length > 0 && (
        <>
          <h2 className="section" style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            Cancelled
            <button className="btn-small" onClick={() => selectAll(cancelled)}>
              all / none
            </button>
          </h2>
          <div className="sub-list">{cancelled.map(row)}</div>
        </>
      )}
    </>
  );
}
