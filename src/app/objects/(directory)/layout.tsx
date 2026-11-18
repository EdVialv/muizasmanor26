import type { ReactNode } from "react";
import DirectoryFrame from "@/components/DirectoryFrame";

/**
 * The list view's frame (src/components/DirectoryFrame.tsx): heading,
 * list/map switch, search field and filter panel, above this route's
 * loading.tsx boundary.
 *
 * The directory is rendered per request (its page reads searchParams). This
 * says so explicitly, so the build never tries to prerender it: the search
 * field and filter panel read useSearchParams() without a Suspense
 * fallback, and render on the server with the real, validated listing.
 */
export const dynamic = "force-dynamic";

export default function DirectoryLayout({ children }: { children: ReactNode }) {
  return <DirectoryFrame>{children}</DirectoryFrame>;
}
