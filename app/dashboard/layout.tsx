import Link from "next/link";
import type { ReactNode } from "react";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <nav className="nav">
        <Link href="/dashboard" className="brand">
          subscribe-reminder
        </Link>
        <div className="links">
          <Link href="/dashboard/add">+ Add</Link>
          <Link href="/dashboard/settings">Settings</Link>
        </div>
      </nav>
      <div className="container">{children}</div>
    </>
  );
}
