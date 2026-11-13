"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { MAX_SEARCH_QUERY_LENGTH, normalizeSearchQuery } from "@/lib/directory/searchQuery";

export const SEARCH_DEBOUNCE_MS = 300;

/** The directory URL for a query: a new search always starts at its first page. */
export function buildSearchHref(pathname: string, query: string | null): string {
  return query ? `${pathname}?${new URLSearchParams({ q: query }).toString()}` : pathname;
}

/**
 * The directory's search field (docs/DAY16_SEARCH_NOTES.md).
 *
 * The URL is the single source of truth: `?q=` decides what the server
 * renders, so refresh, sharing and browser Back/Forward all work. This
 * component only edits the URL:
 *
 * - typing commits the query to the URL 300 ms after the last keystroke;
 *   Enter or the clear button commit at once;
 * - a committed query always drops any `cursor`, so a new search starts on
 *   its first page (the server also refuses a cursor from another search);
 * - a change that does not alter the normalised query (extra spaces) does
 *   nothing, so it cannot reset the visitor's page;
 * - navigations run in a React transition. The App Router renders only the
 *   newest navigation, and the server renders results for the URL that
 *   reached it, so a slow response for an older query can never replace
 *   the results of a newer one. While a search is in flight the field says
 *   so in a polite live region.
 * - if the URL changes from elsewhere (Back/Forward, a link), the field
 *   follows it - but never overwrites what the visitor is still typing.
 *
 * Without JavaScript it is still a plain GET form to the same URL.
 */
export default function DirectorySearchField() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = normalizeSearchQuery(searchParams.get("q"));

  const [value, setValue] = useState(urlQuery ?? "");
  const [isPending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The query this field last sent to the URL. */
  const committedRef = useRef<string | null>(urlQuery);
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
    if (next === urlQuery) {
      return;
    }
    startTransition(() => {
      router.push(buildSearchHref(pathname, next), { scroll: false });
    });
  }

  // Follow URL changes this field did not make (Back/Forward, links).
  useEffect(() => {
    if (urlQuery !== committedRef.current) {
      clearTimer();
      committedRef.current = urlQuery;
      setValue(urlQuery ?? "");
    }
  }, [urlQuery]);

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
        <input
          ref={inputRef}
          id={inputId}
          className="directorySearchInput"
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
        {value ? (
          <button type="button" className="directorySearchClear" onClick={handleClear}>
            Notīrīt
          </button>
        ) : null}
      </div>
      <p id={hintId} className="directorySearchHint">
        Piemēram, „Rundāle” vai „Krāslavas novads”. Garumzīmes un lielie burti nav jāievēro.
      </p>
      <p className="directorySearchStatus" role="status" aria-live="polite">
        {isPending ? "Meklē…" : ""}
      </p>
    </form>
  );
}
