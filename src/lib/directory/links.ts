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
 * returns to the map with the same search and filters.
 *
 * Day 20 (docs/DAY20_URL_STATE_NOTES.md): the map position travels as
 * `fromLat`, `fromLng` and `fromZoom`, and the list cursor travels from the
 * map too, so "back" restores the whole browse state - listing, list page
 * and map position - in whichever view the visitor came from. Each value
 * has a fixed maximum size, so object-to-object links stay bounded.
 *
 * `from`, `fromQ`, `fromFilters`, `fromView`, `fromLat`, `fromLng` and
 * `fromZoom` are untrusted URL input like any other. Each is only used
 * after it validates (see parseDirectoryContext); anything else is dropped
 * and the back link points at the first page.
 */

import { parsePosition, positionEntries, type MapPosition } from "../map/position";
import { buildBrowseHref, validCursorFor } from "./browseState";
import {
  EMPTY_FILTERS,
  canonicalFilters,
  filtersToEntries,
  hasActiveFilters,
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
  /** Day 20: the map position the visitor had, valid and rounded. */
  position?: MapPosition;
}

export const DIRECTORY_PATH = "/objects";
export const MAP_PATH = "/map";
export const FROM_VIEW_MAP = "map";
const FROM_POSITION_KEYS = { lat: "fromLat", lng: "fromLng", zoom: "fromZoom" } as const;

type RawParam = string | string[] | undefined;

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
  from: RawParam,
  fromQ?: RawParam,
  fromFilters?: RawParam,
  fromView?: RawParam,
  fromPosition: { lat?: RawParam; lng?: RawParam; zoom?: RawParam } = {},
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
    context.view = "map";
  }
  const cursor = validCursorFor({ q: q ?? null, filters }, single(from));
  if (cursor) {
    context.cursor = cursor;
  }
  const { position } = parsePosition({
    lat: fromPosition.lat,
    lng: fromPosition.lng,
    zoom: fromPosition.zoom,
  });
  if (position) {
    context.position = position;
  }
  return context;
}

/** parseDirectoryContext for an object page's whole query. */
export function parseDirectoryContextParams(query: Record<string, RawParam>): DirectoryContext {
  return parseDirectoryContext(query.from, query.fromQ, query.fromFilters, query.fromView, {
    lat: query[FROM_POSITION_KEYS.lat],
    lng: query[FROM_POSITION_KEYS.lng],
    zoom: query[FROM_POSITION_KEYS.zoom],
  });
}

/**
 * The directory the visitor came from, in its canonical URL: same view,
 * search, filters, list page and map position.
 */
export function buildDirectoryHref(context: DirectoryContext = {}): string {
  return buildBrowseHref(context.view === "map" ? MAP_PATH : DIRECTORY_PATH, {
    listing: { q: context.q ?? null, filters: context.filters ?? EMPTY_FILTERS },
    cursor: context.cursor ?? null,
    position: context.position ?? null,
  });
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
  if (context.cursor) {
    params.set("from", context.cursor);
  }
  if (context.view === "map") {
    params.set("fromView", FROM_VIEW_MAP);
  }
  for (const [key, value] of positionEntries(context.position ?? null)) {
    params.set(FROM_POSITION_KEYS[key as keyof typeof FROM_POSITION_KEYS], value);
  }
  const path = `${DIRECTORY_PATH}/${encodeURIComponent(slug)}`;
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/** The wording of the "back" link for a context. */
export function directoryBackLabel(context: DirectoryContext = {}): string {
  return context.view === "map" ? "Atpakaļ uz karti" : "Atpakaļ uz katalogu";
}
