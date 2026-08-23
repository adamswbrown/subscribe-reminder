import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { originFromHeaders } from "@/lib/origin";
import { PushToggle } from "@/components/PushToggle";
import { DeleteAccount } from "@/components/DeleteAccount";
import {
  savePushSubscription,
  removePushSubscription,
  hasPushSubscription,
  changeEmail,
  deleteAccount,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ email_sent?: string; email_error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: settings } = await supabase
    .from("user_settings")
    .select("ics_token, email_digest, timezone")
    .single();

  const origin =
    originFromHeaders(await headers()) ?? "http://localhost:3000";
  const feedUrl = settings
    ? `${origin}/api/calendar/${settings.ics_token}.ics`
    : null;

  return (
    <main>
      <h1 style={{ fontSize: "1.3rem" }}>Settings</h1>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Calendar feed</h2>
        <p className="muted" style={{ lineHeight: 1.6 }}>
          Subscribe to this private URL in Apple Calendar, Google Calendar, or
          Outlook and every renewal and cancel-deadline appears as a real
          calendar event with an alarm. It updates automatically as you change
          things here. Keep the link to yourself — the token is the key.
        </p>
        {feedUrl ? (
          <code className="token">{feedUrl}</code>
        ) : (
          <p className="muted">
            Feed not ready yet — sign out and back in if this persists.
          </p>
        )}
      </div>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Push notifications</h2>
        <p className="muted" style={{ lineHeight: 1.6 }}>
          Get cancel-deadline and renewal reminders as notifications on this
          device, alongside email.
        </p>
        <PushToggle
          save={savePushSubscription}
          remove={removePushSubscription}
          isMine={hasPushSubscription}
        />
      </div>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Account</h2>
        <p className="muted">Signed in as {user?.email}</p>

        <form
          action={changeEmail}
          style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}
        >
          <input
            type="email"
            name="email"
            required
            placeholder="new@email.com"
            style={{ maxWidth: "16rem" }}
          />
          <button className="btn-small">Change email</button>
        </form>
        {params.email_sent && (
          <p className="muted">
            Confirmation links sent — check both your old and new inbox to
            finish the change.
          </p>
        )}
        {params.email_error && (
          <p style={{ color: "var(--danger)" }}>
            Couldn&apos;t start the email change — check the address and try
            again.
          </p>
        )}

        <p className="muted" style={{ marginBottom: "0.75rem" }}>
          Export everything you&apos;ve entered:{" "}
          <a href="/api/export">JSON</a> ·{" "}
          <a href="/api/export?format=csv">CSV</a>
        </p>

        <form action="/auth/signout" method="post" style={{ marginBottom: "1rem" }}>
          <button className="btn-small">Sign out</button>
        </form>

        <DeleteAccount action={deleteAccount} />
      </div>
    </main>
  );
}
