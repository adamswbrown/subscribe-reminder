import Link from "next/link";
import type { ReactNode } from "react";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <nav className="nav">
        <Link href="/app" className="brand">
          subscribe-reminder
        </Link>
        <div className="links">
          <Link href="/app/add">+ Add</Link>
          <Link href="/app/settings">Settings</Link>
        </div>
      </nav>
      <div className="container">{children}</div>
    </>
  );
}
