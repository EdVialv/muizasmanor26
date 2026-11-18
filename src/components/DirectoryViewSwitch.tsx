"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDirectoryListing } from "@/components/DirectoryListingProvider";
import { buildListingHref } from "@/lib/directory/filters";
import { DIRECTORY_PATH, MAP_PATH } from "@/lib/directory/links";

/**
 * List / map switch (Day 19 - docs/DAY19_MAP_NOTES.md). Both links carry the
 * latest intended search and filters from the shared listing state - even a
 * change still in flight - and never a cursor, so switching views keeps the
 * selection and starts the other view from its beginning.
 */
export default function DirectoryViewSwitch() {
  const pathname = usePathname();
  const { listing } = useDirectoryListing();
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
              <Link
                href={buildListingHref(view.path, listing)}
                aria-current={current ? "page" : undefined}
              >
                {view.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
