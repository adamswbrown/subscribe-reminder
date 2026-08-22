import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { SWRegister } from "@/components/SWRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "subscribe-reminder",
  description:
    "Track your subscriptions and get reminded in time to actually cancel.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SubRemind",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f1115",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SWRegister />
        {children}
      </body>
    </html>
  );
}
