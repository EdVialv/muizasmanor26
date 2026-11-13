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
 *
 * `from` and `fromQ` are untrusted URL input like any other. Each is only
 * used after it validates (see parseDirectoryContext); anything else is
 * dropped and the back link points at the first page.
 */

import { cursorMatchesScope, decodeCursor } from "./cursor";
import { normalizeSearchQuery, searchScope } from "./searchQuery";

export interface DirectoryContext {
  /** A cursor token that has already passed decodeCursor() and matches `q`. */
  cursor?: string;
  /** Day 16: a normalised search query, when the visitor came from a search. */
  q?: string;
}

export const DIRECTORY_PATH = "/objects";

/**
 * Rebuilds the directory context an object link carried: `from` is the
 * directory's cursor token and `fromQ` its search query. Each is kept only
 * when valid - the query must normalise to something, and the cursor must
 * decode and belong to that same query (or to no query). An invalid cursor
 * is dropped while a valid query is kept, so "back" still returns to the
 * search, just at its first page.
 */
export function parseDirectoryContext(
  from: string | string[] | undefined,
  fromQ?: string | string[] | undefined,
): DirectoryContext {
  const q = normalizeSearchQuery(fromQ) ?? undefined;
  const context: DirectoryContext = q ? { q } : {};
  if (typeof from === "string") {
    const cursor = decodeCursor(from);
    if (cursor && cursorMatchesScope(cursor, q ? searchScope(q) : undefined)) {
      context.cursor = from;
    }
  }
  return context;
}

function withQuery(path: string, params: Array<[string, string | undefined]>): string {
  const search = new URLSearchParams();
  for (const [key, value] of params) {
    if (value) {
      search.set(key, value);
    }
  }
  const encoded = search.toString();
  return encoded ? `${path}?${encoded}` : path;
}

/** The directory listing the visitor came from: same search, same page. */
export function buildDirectoryHref(context: DirectoryContext = {}): string {
  return withQuery(DIRECTORY_PATH, [
    ["q", context.q],
    ["cursor", context.cursor],
  ]);
}

export function buildObjectHref(slug: string, context: DirectoryContext = {}): string {
  return withQuery(`${DIRECTORY_PATH}/${encodeURIComponent(slug)}`, [
    ["fromQ", context.q],
    ["from", context.cursor],
  ]);
}
