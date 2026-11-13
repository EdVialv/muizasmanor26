/**
 * Search-query normalisation and scoping for the Day 16 directory search
 * (docs/DAY16_SEARCH_NOTES.md).
 *
 * Pure and dependency-free on purpose: the server (directory page, object
 * page links) and the browser (the debounced search field) must normalise
 * a query identically, or the field and the URL would disagree about
 * whether the search has changed.
 */

/** Same bounds the database function enforces; applied here first so the URL shows exactly what is searched. */
export const MAX_SEARCH_QUERY_LENGTH = 200;
export const MAX_SEARCH_TERMS = 5;

/**
 * Turns raw input into the canonical query, or null when there is nothing
 * to search for.
 *
 * - only a single string counts (a repeated `?q=` is ignored, not guessed at);
 * - Unicode is NFC-normalised, so a precomposed "ā" and "a" + combining
 *   macron are the same query;
 * - whitespace (including tabs and newlines) collapses to single spaces and
 *   is trimmed;
 * - the query is cut to 200 characters (by code point, never splitting a
 *   character) and then to its first 5 whitespace-separated terms.
 *
 * Case and diacritics are NOT folded here - "Rundāles" stays "Rundāles" in
 * the URL and the field. The database folds both the query and the stored
 * search document the same way (fold_search_text), so matching is case-
 * and diacritic-insensitive regardless.
 */
export function normalizeSearchQuery(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const collapsed = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) {
    return null;
  }
  const cut = Array.from(collapsed).slice(0, MAX_SEARCH_QUERY_LENGTH).join("").trim();
  const terms = cut
    .split(" ")
    .filter((term) => term.length > 0)
    .slice(0, MAX_SEARCH_TERMS);
  return terms.length > 0 ? terms.join(" ") : null;
}

/**
 * A short, stable fingerprint of a normalised query, stored inside every
 * search cursor so a cursor issued for one search can never be applied to
 * a different one (or to the unfiltered directory).
 *
 * 64-bit FNV-1a over the query's UTF-8 bytes, as 16 hex characters. This is
 * not a security boundary: the worst a collision could do is start another
 * search's results at a different, still valid, position. It only has to
 * make an accidental carry-over between two real searches vanishingly
 * unlikely, which 64 bits does.
 */
export function searchScope(normalizedQuery: string): string {
  const FNV_OFFSET = BigInt("0xcbf29ce484222325");
  const FNV_PRIME = BigInt("0x100000001b3");
  const MASK = BigInt("0xffffffffffffffff");
  let hash = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(normalizedQuery)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

export const SEARCH_SCOPE_PATTERN = /^[0-9a-f]{16}$/;
