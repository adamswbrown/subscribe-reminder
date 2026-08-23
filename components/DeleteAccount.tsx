"use client";

import { useState } from "react";

export function DeleteAccount({ action }: { action: () => Promise<void> }) {
  const [arming, setArming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!arming) {
    return (
      <button
        className="btn-small btn-danger"
        onClick={() => setArming(true)}
      >
        Delete my account…
      </button>
    );
  }
  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
      <span className="muted">
        This permanently deletes your account and every subscription, reminder,
        and device — there&apos;s no undo.
      </span>
      <button
        className="btn-small btn-danger"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await action();
          } catch {
            setBusy(false);
          }
        }}
      >
        {busy ? "Deleting…" : "Yes, delete everything"}
      </button>
      <button className="btn-small" disabled={busy} onClick={() => setArming(false)}>
        Keep my account
      </button>
    </div>
  );
}
