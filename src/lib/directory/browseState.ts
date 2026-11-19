/**
 * The canonical URL state of the directory (Day 20 -
 * docs/DAY20_URL_STATE_NOTES.md). One model, shared by the list (/objects)
 * and the map (/map), the server pages, the client provider and every link
 * between them. Pure: runs in Node and in the browser.
 *
 * The view is the path. The query holds, in this order:
 *
 *   q, type, region, access, service, condition, ownership, family,
 *   family_unknown   - the listing (src/lib/directory/filters.ts)
 *   cursor           - the list page (src/lib/directory/cursor.ts)
 *   lat, lng, zoom   - the map position (src/lib/map/position.ts)
 *
 * Every parameter is kept by both views, so switching views loses nothing:
 * the map ignores `cursor`, and the list ignores `lat`/`lng`/`zoom` (map
 * bounds never restrict the list). Defaults are omitted, values are
 * validated, deduplicated and ordered, so one state has exactly one URL.
 * Results and navigation history are never encoded, and every parameter has
 * a fixed upper size, so the URL stays bounded however long the visitor
 * browses.
 */

import { cursorMatchesScope, decodeCursor } from "./cursor";
import { listingScope, listingSearchParams, parseListing, type DirectoryListing } from "./filters";
import { parsePosition, positionEntries, positionsEqual, type MapPosition } from "../map/position";

export const CURSOR_PARAM = "cursor";

export interface BrowseState {
  listing: DirectoryListing;
  /**
   * A list cursor token that decodes and belongs to exactly this listing
   * (same search, same filters), or null for the first page.
   */
  cursor: string | null;
  /** The map's centre and zoom, or null for the default (all of Latvia). */
  position: MapPosition | null;
}

export interface ParsedBrowseState {
  state: BrowseState;
  /** Some filter values were unknown, too long or over the limits and were dropped. */
  hadInvalidValues: boolean;
  /** A cursor was given but was malformed, repeated or from another listing. */
  hadInvalidCursor: boolean;
  /** A map position was given but was partial, repeated, malformed or out of range. */
  hadInvalidPosition: boolean;
}

type ParamsInput = URLSearchParams | Record<string, string | string[] | undefined>;

function all(params: ParamsInput, key: string): string[] {
  if (params instanceof URLSearchParams) {
    return params.getAll(key);
  }
  const value = params[key];
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

/**
 * A cursor token is kept only when it is given once, decodes, and its scope
 * is this listing's - a cursor from another search or filter set (or a
 * tampered one) is dropped and the list starts at its first page.
 */
export function validCursorFor(
  listing: DirectoryListing,
  raw: string | null | undefined,
): string | null {
  if (!raw) {
    return null;
  }
  const decoded = decodeCursor(raw);
  return decoded && cursorMatchesScope(decoded, listingScope(listing)) ? raw : null;
}

export function parseBrowseState(params: ParamsInput): ParsedBrowseState {
  const { hadInvalidValues, q, filters } = parseListing(params);
  const listing: DirectoryListing = { q, filters };
  const rawCursors = all(params, CURSOR_PARAM);
  const cursor = rawCursors.length === 1 ? validCursorFor(listing, rawCursors[0]) : null;
  const { position, hadInvalidPosition } = parsePosition(params);
  return {
    state: { listing, cursor, position },
    hadInvalidValues,
    hadInvalidCursor: rawCursors.some(Boolean) && cursor === null,
    hadInvalidPosition,
  };
}

/** The canonical query parameters of a state (defaults omitted). */
export function browseSearchParams(state: BrowseState): URLSearchParams {
  const params = listingSearchParams(state.listing, state.cursor ?? undefined);
  for (const [key, value] of positionEntries(state.position)) {
    params.append(key, value);
  }
  return params;
}

/** The canonical URL of a state in one view (path). */
export function buildBrowseHref(pathname: string, state: BrowseState): string {
  const query = browseSearchParams(state).toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** One string per state: equal states have equal keys. */
export function browseKey(state: BrowseState): string {
  return browseSearchParams(state).toString();
}

/**
 * The part of the state the server renders the list from: listing and
 * cursor. A change here needs a server navigation; a change of the map
 * position alone does not.
 */
export function routeKey(state: BrowseState): string {
  return listingSearchParams(state.listing, state.cursor ?? undefined).toString();
}

export function browseStatesEqual(a: BrowseState, b: BrowseState): boolean {
  return routeKey(a) === routeKey(b) && positionsEqual(a.position, b.position);
}
