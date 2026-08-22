"use client";

import { useState } from "react";

const COLORS = [
  "#f87171",
  "#fbbf24",
  "#34d399",
  "#6ea8fe",
  "#a78bfa",
  "#f472b6",
  "#38bdf8",
  "#fb923c",
];

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function ServiceLogo({
  name,
  domain,
  size = 20,
}: {
  name: string;
  domain?: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  if (!domain || failed) {
    const color = COLORS[hashCode(name) % COLORS.length];
    return (
      <span
        className="logo monogram"
        aria-hidden
        style={{
          width: size,
          height: size,
          background: `color-mix(in srgb, ${color} 22%, transparent)`,
          color,
          fontSize: size * 0.55,
        }}
      >
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="logo"
      src={`https://icons.duckduckgo.com/ip3/${domain}.ico`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
