import type { ReactNode } from "react";
import DirectoryFrame from "@/components/DirectoryFrame";

/**
 * The map view's frame - the same heading, list/map switch, search field,
 * filter panel and shared listing state as the list (Day 19 -
 * docs/DAY19_MAP_NOTES.md). Rendered per request for the same reason as the
 * list's layout.
 */
export const dynamic = "force-dynamic";

export default function MapLayout({ children }: { children: ReactNode }) {
  return <DirectoryFrame>{children}</DirectoryFrame>;
}
