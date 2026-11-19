import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * The administration area (Day 21). This layout only sets what every staff
 * page shares - it is NOT an authorisation boundary: each page, route
 * handler and server action checks the session and role itself
 * (src/lib/auth/session.ts). Staff pages are personal, so they are always
 * rendered per request and never indexed.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Administrēšana",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <section className="adminSection">
      <div className="container adminContainer">{children}</div>
    </section>
  );
}
