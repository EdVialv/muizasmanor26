"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The site-wide header: wordmark + primary navigation, shared by every page
 * via the root layout (see src/components/AppShell.tsx).
 *
 * Day 12 shipped this as a server component with a single, hardcoded
 * "Sākums" link and a hardcoded `aria-current="page"`, because Home was the
 * only route that existed - see docs/DAY12_DESIGN_SYSTEM_NOTES.md decision
 * 2, which explicitly flagged that a second nav item would need
 * `usePathname()` instead. Day 13 adds the directory (`/objects`), so this
 * is now a client component: `aria-current` is computed per route from the
 * actual pathname, not assumed. Add a new route's `<li>` to NAV_ITEMS below
 * once its page ships - no further structural change should be needed.
 */
const NAV_ITEMS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/", label: "Sākums" },
  { href: "/objects", label: "Objekti" },
];

export default function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="siteHeader">
      <div className="siteHeaderInner container">
        <Link className="wordmark" href="/">
          Latvijas muižas
        </Link>
        <nav className="siteNav" aria-label="Galvenā navigācija">
          <ul>
            {NAV_ITEMS.map((item) => {
              const isCurrent = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link href={item.href} aria-current={isCurrent ? "page" : undefined}>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
