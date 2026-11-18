/**
 * Links between the directory and object pages that carry the visitor's
 * place in the directory along with them (docs/DAY14_OBJECT_PAGES_NOTES.md).
 *
 * The directory's own state is a single bounded `cursor` token
 * (src/lib/directory/cursor.ts). An object link opened from page N of the
 * directory carries that same token as `from`, so the object page can offer
 * "back to the directory" at page N instead of page 1 - and links onward to
 * a related object keep passing it along. It is one token, not a history:
 * the Day 13 review removed an accumulating URL history parameter, and this
 * does not reintroduce one.
 *
 * Day 16: when the visitor came from a search, its query travels as
 * `fromQ` next to `from`, and "back" returns to the same search results.
 * Day 17: active filters travel as `fromFilters`, one parameter holding the
 * canonical filter query string (bounded by the filter limits in
 * filters.ts), so "back" returns to the same filtered listing too.
 *
 * Day 19: an object opened from the map carries `fromView=map`, and "back"
 * returns to the map with the same search and filters (the map position
 * itself is Day 20's URL work). A map link carries no cursor.
 *
 * `from`, `fromQ`, `fromFilters` and `fromView` are untrusted URL input like any other. Each is only
 * used after it validates (see parseDirectoryContext); anything else is
 * dropped and the back link points at the first page.
 */

import { cursorMatchesScope, decodeCursor } from "./cursor";
import {
  EMPTY_FILTERS,
  buildListingHref,
  canonicalFilters,
  filtersToEntries,
  hasActiveFilters,
  listingScope,
  parseFilters,
  type DirectoryFilters,
} from "./filters";
import { normalizeSearchQuery } from "./searchQuery";

export interface DirectoryContext {
  /** A cursor token that has already passed decodeCursor() and matches this listing. */
  cursor?: string;
  /** Day 16: a normalised search query, when the visitor came from a search. */
  q?: string;
  /** Day 17: canonical active filters, when the visitor came from a filtered listing. */
  filters?: DirectoryFilters;
  /** Day 19: the visitor came from the map rather than the list. */
  view?: "map";
}

export const DIRECTORY_PATH = "/objects";
export const MAP_PATH = "/map";
export const FROM_VIEW_MAP = "map";

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Rebuilds the directory context an object link carried: `from` is the
 * directory's cursor token, `fromQ` its search query and `fromFilters` its
 * filters. Each is kept only when valid - the query must normalise to
 * something, filter values must be known, and the cursor must decode and
 * belong to exactly that listing. An invalid cursor is dropped while a
 * valid search and filters are kept, so "back" still returns to the same
 * listing, just at its first page.
 */
export function parseDirectoryContext(
  from: string | string[] | undefined,
  fromQ?: string | string[] | undefined,
  fromFilters?: string | string[] | undefined,
  fromView?: string | string[] | undefined,
): DirectoryContext {
  const q = normalizeSearchQuery(fromQ) ?? undefined;
  const rawFilters = single(fromFilters);
  const filters = rawFilters
    ? parseFilters(new URLSearchParams(rawFilters)).filters
    : EMPTY_FILTERS;

  const context: DirectoryContext = {};
  if (q) {
    context.q = q;
  }
  if (hasActiveFilters(filters)) {
    context.filters = filters;
  }
  if (single(fromView) === FROM_VIEW_MAP) {
    // The map has no cursor; any `from` is ignored.
    context.view = "map";
    return context;
  }

  const rawCursor = single(from);
  if (rawCursor) {
    const cursor = decodeCursor(rawCursor);
    const scope = listingScope({ q: q ?? null, filters });
    if (cursor && cursorMatchesScope(cursor, scope)) {
      context.cursor = rawCursor;
    }
  }
  return context;
}

/** The directory listing the visitor came from: same search, same filters, same page (or the map). */
export function buildDirectoryHref(context: DirectoryContext = {}): string {
  if (context.view === "map") {
    return buildListingHref(MAP_PATH, {
      q: context.q ?? null,
      filters: context.filters ?? EMPTY_FILTERS,
    });
  }
  return buildListingHref(
    DIRECTORY_PATH,
    { q: context.q ?? null, filters: context.filters ?? EMPTY_FILTERS },
    context.cursor,
  );
}

export function buildObjectHref(slug: string, context: DirectoryContext = {}): string {
  const params = new URLSearchParams();
  if (context.q) {
    params.set("fromQ", context.q);
  }
  if (context.filters && hasActiveFilters(context.filters)) {
    params.set(
      "fromFilters",
      new URLSearchParams(filtersToEntries(canonicalFilters(context.filters))).toString(),
    );
  }
  if (context.view === "map") {
    params.set("fromView", FROM_VIEW_MAP);
  } else if (context.cursor) {
    params.set("from", context.cursor);
  }
  const path = `${DIRECTORY_PATH}/${encodeURIComponent(slug)}`;
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/** The wording of the "back" link for a context. */
export function directoryBackLabel(context: DirectoryContext = {}): string {
  return context.view === "map" ? "Atpakaļ uz karti" : "Atpakaļ uz katalogu";
}
