"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";

const NAV_ITEMS = [
  { href: "/", label: "Atklāt" },
  { href: "/objects", label: "Muižas" },
  { href: "/map", label: "Karte" },
];

export default function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="siteHeader">
      <div className="siteHeaderInner container">
        <Link className="wordmark" href="/" aria-label="MuizasDB — sākumlapa">
          <span className="brandIcon">
            <Icon name="manor" width="38" height="38" />
          </span>
          <span>
            MuizasDB<span className="brandSubtitle">Latvijas muižas un pilis</span>
          </span>
        </Link>
        <nav className="siteNav" aria-label="Galvenā navigācija">
          <ul>
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link href={item.href} aria-current={pathname === item.href ? "page" : undefined}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
