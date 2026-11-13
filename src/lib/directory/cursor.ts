/**
 * Cursor encoding/decoding for the Day 13 public directory
 * (docs/DAY13_DIRECTORY_NOTES.md).
 *
 * The directory orders published heritage objects by (name_lv, id) ascending
 * - name_lv for a usable alphabetical listing, id as a unique tie-breaker so
 * the ordering (and therefore the cursor) is fully deterministic even when
 * two objects share a name. A cursor is the (name_lv, id) of the last row on
 * the previous page: "give me rows strictly after this pair."
 *
 * A cursor travels in the URL as an opaque, base64url-encoded JSON token, so
 * the page is linkable and refresh-safe. It is never trusted as-is: every
 * decode re-validates both fields before any query is built from it, and any
 * failure - bad base64, invalid JSON, wrong shape, an id that is not a UUID,
 * a name outside a sane length - returns null rather than throwing, so a
 * malformed or tampered cursor fails safely back to "no cursor" (the first
 * page) instead of reaching a query or crashing the request. The encoded
 * token is length-limited before decoding so an attacker cannot make the
 * server allocate an arbitrarily large Buffer. See "Decisions requiring
 * Codex review" in docs/DAY13_DIRECTORY_NOTES.md for why the actual keyset
 * query (src/lib/directory/queries.ts) never builds a composite PostgREST
 * filter string out of these values either, even once decoded.
 */

export interface DirectoryCursor {
  /** heritage_objects.name_lv of the last row on the previous page. */
  name: string;
  /** heritage_objects.id (UUID) of the last row on the previous page. */
  id: string;
  /**
   * Day 16: present only on a cursor issued by a search, holding
   * searchScope() of that search's normalised query. A cursor is only ever
   * applied to the listing it came from - see cursorMatchesScope().
   */
  scope?: string;
}

import { SEARCH_SCOPE_PATTERN } from "./searchQuery";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Defends against a pathologically long name_lv value bloating the cursor or the query. */
const MAX_CURSOR_NAME_LENGTH = 500;
/** Upper bound checked before Buffer decoding untrusted URL input. */
const MAX_CURSOR_TOKEN_LENGTH = 2_048;

function isValidCursorShape(value: unknown): value is DirectoryCursor {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  const allowed = new Set(["name", "id", "scope"]);
  if (!keys.includes("name") || !keys.includes("id") || keys.some((key) => !allowed.has(key))) {
    return false;
  }
  if (
    keys.includes("scope") &&
    (typeof candidate.scope !== "string" || !SEARCH_SCOPE_PATTERN.test(candidate.scope))
  ) {
    return false;
  }
  if (typeof candidate.name !== "string" || candidate.name.length === 0) {
    return false;
  }
  if (candidate.name.length > MAX_CURSOR_NAME_LENGTH) {
    return false;
  }
  if (typeof candidate.id !== "string" || !UUID_PATTERN.test(candidate.id)) {
    return false;
  }
  return true;
}

export function encodeCursor(cursor: DirectoryCursor): string {
  const json = JSON.stringify(
    cursor.scope === undefined
      ? { name: cursor.name, id: cursor.id }
      : { name: cursor.name, id: cursor.id, scope: cursor.scope },
  );
  return Buffer.from(json, "utf8").toString("base64url");
}

/**
 * Decodes and fully validates a cursor token. Returns null for anything that
 * is not exactly a well-formed { name, id } pair - this function never
 * throws, so callers can treat null as "fail safely to the first page"
 * without a try/catch of their own.
 */
export function decodeCursor(raw: string | undefined | null): DirectoryCursor | null {
  if (!raw) {
    return null;
  }
  if (raw.length > MAX_CURSOR_TOKEN_LENGTH) {
    return null;
  }
  // base64url only ever contains these characters; reject anything else
  // before even attempting to decode, rather than letting an unusual input
  // reach Buffer's more permissive decoder.
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) {
    return null;
  }
  let json: string;
  try {
    json = Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isValidCursorShape(parsed)) {
    return null;
  }
  return parsed.scope === undefined
    ? { name: parsed.name, id: parsed.id }
    : { name: parsed.name, id: parsed.id, scope: parsed.scope };
}

/**
 * True only when a decoded cursor belongs to the listing it is about to be
 * used for: an unscoped cursor for the unfiltered directory, and a cursor
 * scoped to exactly this search for a search. Anything else - a directory
 * cursor carried into a search, one search's cursor carried into another,
 * or a search cursor on the plain directory - is rejected, so the page
 * starts that listing from its first page instead of silently resuming at
 * a position that belongs to different results.
 */
export function cursorMatchesScope(cursor: DirectoryCursor, scope: string | undefined): boolean {
  return cursor.scope === scope;
}

export interface DirectoryPageLinkParams {
  q?: string;
  cursor?: string;
  // Index signature so this is directly usable as a Next.js <Link> query
  // object (ParsedUrlQueryInput) without a cast at every call site.
  [key: string]: string | undefined;
}

/**
 * Query params for the next page. Browser Back provides reverse navigation.
 * A search keeps its query alongside the (search-scoped) cursor.
 */
export function buildNextPageParams(
  nextCursor: DirectoryCursor,
  query?: string | null,
): DirectoryPageLinkParams {
  return query
    ? { q: query, cursor: encodeCursor(nextCursor) }
    : { cursor: encodeCursor(nextCursor) };
}
