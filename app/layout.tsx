import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "subscribe-reminder",
  description:
    "Track your subscriptions and get reminded in time to actually cancel.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          background: "#0f1115",
          color: "#e8eaed",
          minHeight: "100vh",
        }}
      >
        {children}
      </body>
    </html>
  );
}
