import type { ReactNode } from "react";
import DirectoryFilterPanel from "@/components/DirectoryFilterPanel";
import { DirectoryListingProvider } from "@/components/DirectoryListingProvider";
import DirectorySearchField from "@/components/DirectorySearchField";
import { loadRegionOptionsFromEnv } from "@/lib/directory/regionOptions";

/**
 * The directory's frame: heading, search field (Day 16 -
 * docs/DAY16_SEARCH_NOTES.md) and filter panel (Day 17 -
 * docs/DAY17_DIRECTORY_FILTERS_NOTES.md).
 *
 * They live in a layout, above the route's loading.tsx boundary, so that
 * while a search or a page of results is loading only the results area
 * changes - the field and the panel keep their state, caret and keyboard focus.
 */
/**
 * The directory is rendered per request (its page reads searchParams). This
 * says so explicitly, so the build never tries to prerender it: the search
 * field and filter panel below read useSearchParams() without a Suspense
 * fallback, and render on the server with the real, validated listing.
 */
export const dynamic = "force-dynamic";

export default async function DirectoryLayout({ children }: { children: ReactNode }) {
  // Loaded once per full page load: a layout is not re-rendered when only
  // the search parameters change. Null when unavailable - the panel says so
  // and every other filter still works.
  const regionOptions = await loadRegionOptionsFromEnv();

  return (
    <section className="objectsSection">
      <div className="container">
        <h1 className="objectsHeading">Muižu un kultūrvēsturisko objektu katalogs</h1>
        {/* One shared listing state for the search field and the filter
            panel, so neither can erase the other's newest change. No
            Suspense boundary: the route is dynamic (above), so
            useSearchParams() renders with the real URL on the server and
            never suspends. The server HTML is
            therefore the complete no-JavaScript form, active filters
            included - there is no reduced fallback that could drop them. */}
        <DirectoryListingProvider>
          <DirectorySearchField />
          <DirectoryFilterPanel regionOptions={regionOptions} />
        </DirectoryListingProvider>
        {children}
      </div>
    </section>
  );
}
