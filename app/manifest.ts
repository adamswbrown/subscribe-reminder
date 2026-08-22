import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "subscribe-reminder",
    short_name: "SubRemind",
    description:
      "Track your subscriptions and get reminded in time to actually cancel.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0f1115",
    theme_color: "#0f1115",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
