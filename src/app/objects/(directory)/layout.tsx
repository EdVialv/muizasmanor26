import type { ReactNode } from "react";
import { Suspense } from "react";
import DirectoryFilterPanel from "@/components/DirectoryFilterPanel";
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
export default async function DirectoryLayout({ children }: { children: ReactNode }) {
  // Loaded once per full page load: a layout is not re-rendered when only
  // the search parameters change. Null when unavailable - the panel says so
  // and every other filter still works.
  const regionOptions = await loadRegionOptionsFromEnv();

  return (
    <section className="objectsSection">
      <div className="container">
        <h1 className="objectsHeading">Muižu un kultūrvēsturisko objektu katalogs</h1>
        {/* useSearchParams() needs a Suspense boundary; on this dynamic route
            the fallback is only a no-JavaScript stand-in. */}
        <Suspense fallback={<SearchFieldFallback />}>
          <DirectorySearchField />
        </Suspense>
        <Suspense fallback={null}>
          <DirectoryFilterPanel regionOptions={regionOptions} />
        </Suspense>
        {children}
      </div>
    </section>
  );
}

function SearchFieldFallback() {
  return (
    <form className="directorySearch" role="search" action="/objects" method="get">
      <label className="directorySearchLabel" htmlFor="directory-search-fallback">
        Meklēt pēc nosaukuma vai vietas
      </label>
      <div className="directorySearchControls">
        <input
          id="directory-search-fallback"
          className="directorySearchInput"
          type="search"
          name="q"
          autoComplete="off"
        />
      </div>
    </form>
  );
}
