"use client";

import Link from "next/link";
import Icon from "./Icon";
import { usePathname } from "next/navigation";
import { useDirectoryListing } from "@/components/DirectoryListingProvider";
import { DIRECTORY_PATH, MAP_PATH } from "@/lib/directory/links";

/**
 * List / map switch (Day 19 - docs/DAY19_MAP_NOTES.md). Both links carry
 * the whole latest intended browse state (Day 20 -
 * docs/DAY20_URL_STATE_NOTES.md): search, filters, the list cursor and the
 * map position - even a change still in flight. The map ignores the cursor
 * and the list ignores the position, but each keeps them, so going to the
 * map and back returns to the same list page, and the other way round to
 * the same map view. Switching views adds a history entry.
 */
export default function DirectoryViewSwitch() {
  const pathname = usePathname();
  const { hrefFor } = useDirectoryListing();
  const views = [
    { path: DIRECTORY_PATH, label: "Saraksts" },
    { path: MAP_PATH, label: "Karte" },
  ];

  return (
    <nav className="directoryViewSwitch" aria-label="Skats">
      <ul>
        {views.map((view) => {
          const current = pathname === view.path;
          return (
            <li key={view.path}>
              <Link href={hrefFor(view.path)} aria-current={current ? "page" : undefined}>
                <Icon name={view.path === MAP_PATH ? "map" : "list"} width="18" height="18" />
                {view.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
