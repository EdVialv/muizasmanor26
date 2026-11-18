import type { ReactNode } from "react";
import DirectoryFilterPanel from "@/components/DirectoryFilterPanel";
import { DirectoryListingProvider } from "@/components/DirectoryListingProvider";
import DirectorySearchField from "@/components/DirectorySearchField";
import DirectoryViewSwitch from "@/components/DirectoryViewSwitch";
import { loadRegionOptionsFromEnv } from "@/lib/directory/regionOptions";

/**
 * The frame shared by the list (/objects) and the map (/map): heading,
 * list/map switch, search field (Day 16) and filter panel (Days 17-18),
 * all under one DirectoryListingProvider, with the view inside it - so the
 * map reads the same latest intended listing as the controls, and no view
 * can reintroduce the search/filter race (docs/DAY17_DIRECTORY_FILTERS_NOTES.md).
 *
 * Used from each route's layout, above its loading boundary, so the
 * controls keep their state, caret and focus while results load. No
 * Suspense boundary: both routes are declared dynamic, so useSearchParams()
 * renders with the real URL on the server and the no-JavaScript forms are
 * complete.
 */
export default async function DirectoryFrame({ children }: { children: ReactNode }) {
  // Loaded once per full page load: a layout is not re-rendered when only
  // the search parameters change. Null when unavailable - the panel says so
  // and every other filter still works.
  const regionOptions = await loadRegionOptionsFromEnv();

  return (
    <section className="objectsSection">
      <div className="container">
        <h1 className="objectsHeading">Muižu un kultūrvēsturisko objektu katalogs</h1>
        <DirectoryListingProvider>
          <DirectoryViewSwitch />
          <DirectorySearchField />
          <DirectoryFilterPanel regionOptions={regionOptions} />
          {children}
        </DirectoryListingProvider>
      </div>
    </section>
  );
}
