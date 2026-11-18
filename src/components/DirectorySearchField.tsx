"use client";

import Icon from "./Icon";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useDirectoryListing } from "@/components/DirectoryListingProvider";
import {
  EMPTY_FILTERS,
  buildListingHref,
  filtersToEntries,
  type DirectoryFilters,
} from "@/lib/directory/filters";
import { MAX_SEARCH_QUERY_LENGTH, normalizeSearchQuery } from "@/lib/directory/searchQuery";

/** For useSyncExternalStore: "hydrated" never changes once true. */
function subscribeToNothing() {
  return () => {};
}

export const SEARCH_DEBOUNCE_MS = 300;

/**
 * The directory URL for a query: a new search always starts at its first
 * page, and keeps the active filters (Day 17).
 */
export function buildSearchHref(
  pathname: string,
  query: string | null,
  filters: DirectoryFilters = EMPTY_FILTERS,
): string {
  return buildListingHref(pathname, { q: query, filters });
}

/**
 * The directory's search field (docs/DAY16_SEARCH_NOTES.md).
 *
 * The URL decides what the server renders, so refresh, sharing and browser
 * Back/Forward all work. The field changes the URL only through the shared
 * listing controller (DirectoryListingProvider), together with the filter
 * panel, so neither can erase the other's newest change:
 *
 * - typing commits the query 300 ms after the last keystroke; Enter or the
 *   clear button commit at once;
 * - a committed query keeps the latest intended filters and always drops
 *   any `cursor`, so a new search starts on its first page (the server also
 *   refuses a cursor from another search);
 * - a change that does not alter the normalised query (extra spaces) does
 *   nothing, so it cannot reset the visitor's page;
 * - while a search is in flight the field says so in a polite live region;
 * - if the listing changes from elsewhere (Back/Forward, "clear search and
 *   filters"), the field follows it - but never overwrites what the visitor
 *   is still typing.
 *
 * Without JavaScript it is still a plain GET form to the same URL, carrying
 * the active filters as hidden inputs - in their canonical, validated form
 * (filtersToEntries) and never with a cursor - so a search keeps them.
 */
export default function DirectorySearchField() {
  const pathname = usePathname();
  const { listing, setQuery, pendingSource } = useDirectoryListing();
  const intendedQuery = listing.q;
  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  const [value, setValue] = useState(intendedQuery ?? "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The query this field last committed. */
  const committedRef = useRef<string | null>(intendedQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const hintId = useId();

  function clearTimer() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function commit(raw: string) {
    clearTimer();
    const next = normalizeSearchQuery(raw);
    committedRef.current = next;
    // Built on the latest intended filters, not on a URL snapshot; a no-op
    // when the normalised query is unchanged.
    setQuery(next);
  }

  // Follow listing changes this field did not make (Back/Forward, links,
  // "clear search and filters").
  useEffect(() => {
    if (intendedQuery !== committedRef.current) {
      clearTimer();
      committedRef.current = intendedQuery;
      setValue(intendedQuery ?? "");
    }
  }, [intendedQuery]);

  useEffect(() => clearTimer, []);

  function handleChange(nextValue: string) {
    setValue(nextValue);
    clearTimer();
    timerRef.current = setTimeout(() => commit(nextValue), SEARCH_DEBOUNCE_MS);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    commit(value);
  }

  function handleClear() {
    setValue("");
    commit("");
    inputRef.current?.focus();
  }

  return (
    <form
      className="directorySearch"
      role="search"
      action={pathname}
      method="get"
      onSubmit={handleSubmit}
    >
      <label className="directorySearchLabel" htmlFor={inputId}>
        Meklēt pēc nosaukuma vai vietas
      </label>
      <div className="directorySearchControls">
        <Icon name="search" />
        <input
          ref={inputRef}
          id={inputId}
          className="directorySearchInput"
          placeholder="Meklēt muižu vai vietu"
          type="search"
          name="q"
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          maxLength={MAX_SEARCH_QUERY_LENGTH}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          aria-describedby={hintId}
        />
        {value && hydrated ? (
          <button type="button" className="directorySearchClear" onClick={handleClear}>
            Notīrīt
          </button>
        ) : intendedQuery && !hydrated ? (
          // Without JavaScript: a link to the same filters with no search.
          <a
            className="directorySearchClear"
            href={buildListingHref(pathname, { q: null, filters: listing.filters })}
          >
            Notīrīt
          </a>
        ) : null}
        <button type="submit" className="primaryAction">
          Meklēt
        </button>
      </div>
      {/* Active filters for a no-JavaScript submit: canonical and validated,
          never a cursor. */}
      {filtersToEntries(listing.filters).map(([name, filterValue]) => (
        <input key={`${name}=${filterValue}`} type="hidden" name={name} value={filterValue} />
      ))}
      <p id={hintId} className="directorySearchHint">
        Piemēram, „Rundāle” vai „Krāslavas novads”. Garumzīmes un lielie burti nav jāievēro.
      </p>
      <p className="directorySearchStatus" role="status" aria-live="polite">
        {pendingSource === "search" ? "Meklē…" : ""}
      </p>
    </form>
  );
}
