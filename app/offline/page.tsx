export default function Offline() {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "2rem",
        textAlign: "center",
        gap: "0.75rem",
      }}
    >
      <h1 style={{ fontSize: "1.4rem", margin: 0 }}>You&apos;re offline</h1>
      <p style={{ color: "var(--text-dim)", maxWidth: "26rem", lineHeight: 1.6 }}>
        subscribe-reminder needs a connection to load your subscriptions.
        Your calendar feed and any push reminders already delivered still work.
      </p>
    </main>
  );
}
