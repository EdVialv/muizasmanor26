"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useDirectoryListing } from "@/components/DirectoryListingProvider";
import { buildBrowseHref } from "@/lib/directory/browseState";
import {
  EMPTY_FILTERS,
  buildListingHref,
  filtersToEntries,
  type DirectoryFilters,
} from "@/lib/directory/filters";
import { MAX_SEARCH_QUERY_LENGTH, normalizeSearchQuery } from "@/lib/directory/searchQuery";
import { positionEntries } from "@/lib/map/position";

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
 * - if the listing changes from elsewhere ("clear search and filters"),
 *   the field follows it - but never overwrites what the visitor is still
 *   typing;
 * - Day 20: Back/Forward (a new epoch) cancels a pending debounced commit
 *   and shows the restored query; a commit scheduled before it is ignored
 *   by the provider even if its timer already fired. One typing burst
 *   adds one history entry; leaving the field ends the burst.
 *
 * Without JavaScript it is still a plain GET form to the same URL, carrying
 * the active filters and the map position as hidden inputs - in their
 * canonical, validated form and never with a cursor - so a search keeps
 * them.
 */
export default function DirectorySearchField() {
  const pathname = usePathname();
  const { listing, position, epoch, setQuery, endSearchBurst, pendingSource } =
    useDirectoryListing();
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

  function commit(raw: string, startedInEpoch: number) {
    clearTimer();
    const next = normalizeSearchQuery(raw);
    committedRef.current = next;
    // Built on the latest intended filters, not on a URL snapshot; a no-op
    // when the normalised query is unchanged, ignored when Back/Forward
    // happened since the change was made.
    setQuery(next, { epoch: startedInEpoch });
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

  // Back/Forward or a link restored a state: drop anything still pending
  // and show the restored query, even if it equals the last committed one.
  const seenEpochRef = useRef(epoch);
  useEffect(() => {
    if (seenEpochRef.current !== epoch) {
      seenEpochRef.current = epoch;
      clearTimer();
      committedRef.current = intendedQuery;
      setValue(intendedQuery ?? "");
    }
  }, [epoch, intendedQuery]);

  useEffect(() => clearTimer, []);

  function handleChange(nextValue: string) {
    setValue(nextValue);
    clearTimer();
    const startedInEpoch = epoch;
    timerRef.current = setTimeout(() => commit(nextValue, startedInEpoch), SEARCH_DEBOUNCE_MS);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    commit(value, epoch);
  }

  function handleClear() {
    setValue("");
    commit("", epoch);
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
        <input
          ref={inputRef}
          id={inputId}
          className="directorySearchInput"
          type="search"
          name="q"
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          onBlur={endSearchBurst}
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
            href={buildBrowseHref(pathname, {
              listing: { q: null, filters: listing.filters },
              cursor: null,
              position,
            })}
          >
            Notīrīt
          </a>
        ) : null}
      </div>
      {/* Active filters and map position for a no-JavaScript submit:
          canonical and validated, never a cursor. */}
      {[...filtersToEntries(listing.filters), ...positionEntries(position)].map(
        ([name, hiddenValue]) => (
          <input key={`${name}=${hiddenValue}`} type="hidden" name={name} value={hiddenValue} />
        ),
      )}
      <p id={hintId} className="directorySearchHint">
        Piemēram, „Rundāle” vai „Krāslavas novads”. Garumzīmes un lielie burti nav jāievēro.
      </p>
      <p className="directorySearchStatus" role="status" aria-live="polite">
        {pendingSource === "search" ? "Meklē…" : ""}
      </p>
    </form>
  );
}
