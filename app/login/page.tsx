"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    setDeleted(
      new URLSearchParams(window.location.search).has("account_deleted")
    );
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  return (
    <main
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "2rem",
      }}
    >
      <div className="card" style={{ width: "100%", maxWidth: "24rem" }}>
        <h1 style={{ marginTop: 0, fontSize: "1.3rem" }}>Sign in</h1>
        {deleted && (
          <p style={{ color: "var(--good)" }}>
            Your account and all its data have been deleted.
          </p>
        )}
        {sent ? (
          <p style={{ color: "var(--text-dim)", lineHeight: 1.6 }}>
            Check your email — we&apos;ve sent you a sign-in link. You can close
            this tab.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={busy}
              style={{ width: "100%" }}
            >
              {busy ? "Sending…" : "Email me a sign-in link"}
            </button>
            {error && (
              <p style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
                {error}
              </p>
            )}
            <p className="muted" style={{ marginBottom: 0 }}>
              No password needed — we use your email for reminders anyway.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
