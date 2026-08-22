export default function Home() {
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
        gap: "1rem",
      }}
    >
      <h1 style={{ fontSize: "2.25rem", margin: 0 }}>subscribe-reminder</h1>
      <p style={{ maxWidth: "34rem", lineHeight: 1.6, color: "#a8adb5" }}>
        Track your subscriptions — streaming, gyms, broadband, news — and get
        reminded in time to actually cancel or renegotiate. Coming soon.
      </p>
      <p style={{ fontSize: "0.85rem", color: "#6b7280" }}>
        Deployment pipeline: live ✓
      </p>
    </main>
  );
}
