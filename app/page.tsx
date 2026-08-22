import Link from "next/link";

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
      <p style={{ maxWidth: "34rem", lineHeight: 1.6, color: "var(--text-dim)" }}>
        Track your subscriptions — streaming, gyms, broadband, news — and get
        reminded in time to actually cancel or renegotiate. Took something for
        a month? We&apos;ll make sure it stays a month.
      </p>
      <Link href="/login" className="btn btn-primary">
        Get started
      </Link>
    </main>
  );
}
