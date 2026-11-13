import type { ReactNode } from "react";
import { Suspense } from "react";
import DirectorySearchField from "@/components/DirectorySearchField";

/**
 * The directory's frame: heading and search field (Day 16 -
 * docs/DAY16_SEARCH_NOTES.md).
 *
 * They live in a layout, above the route's loading.tsx boundary, so that
 * while a search or a page of results is loading only the results area
 * changes - the field keeps its text, its caret and keyboard focus.
 */
export default function DirectoryLayout({ children }: { children: ReactNode }) {
  return (
    <section className="objectsSection">
      <div className="container">
        <h1 className="objectsHeading">Muižu un kultūrvēsturisko objektu katalogs</h1>
        {/* useSearchParams() needs a Suspense boundary; on this dynamic route
            the fallback is only a no-JavaScript stand-in. */}
        <Suspense fallback={<SearchFieldFallback />}>
          <DirectorySearchField />
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
