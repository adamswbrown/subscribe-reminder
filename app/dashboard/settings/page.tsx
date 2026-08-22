import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { originFromHeaders } from "@/lib/origin";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
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
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Account</h2>
        <p className="muted">Signed in as {user?.email}</p>
        <form action="/auth/signout" method="post">
          <button className="btn-small">Sign out</button>
        </form>
      </div>
    </main>
  );
}
