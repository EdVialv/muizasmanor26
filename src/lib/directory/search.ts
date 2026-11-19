/**
 * Directory search orchestration (docs/DAY16_SEARCH_NOTES.md).
 *
 * Same split as the rest of src/lib/directory: types, the
 * DirectorySearchDataSource seam and the paging logic live here with no
 * Supabase import, and are unit-tested against an in-memory fake. The
 * Supabase-backed implementation is in supabaseSearchDataSource.ts.
 *
 * Matching itself happens in PostgreSQL (search_public_heritage_objects,
 * supabase/migrations/20261113120000_directory_search.sql): every term of
 * the query must occur, case- and diacritic-insensitively, somewhere in the
 * object's name, municipality or recorded alternate/historical names.
 * Results keep the directory's (name_lv, id) order, so search pages use the
 * same exact keyset pagination as the unfiltered directory.
 */

import type { DirectoryCursor } from "./cursor";
import {
  EMPTY_FILTERS,
  canonicalFilters,
  isPlainDirectory,
  listingScope,
  type DirectoryFilters,
  type DirectoryListing,
} from "./filters";
import {
  DIRECTORY_PAGE_SIZE,
  DirectoryQueryError,
  toPageResult,
  type DirectoryPageResult,
  type RawDirectoryRow,
} from "./queries";
import { normalizeSearchQuery } from "./searchQuery";

export interface DirectorySearchDataSource {
  /**
   * Up to `limit` published objects matching `query` (when given) and every
   * active filter, in (name_lv, id) order, strictly after `after` when
   * given. `query` is already normalised and `filters` canonical.
   */
  searchPublishedObjects(
    query: string | null,
    filters: DirectoryFilters,
    after: DirectoryCursor | null,
    limit: number,
  ): Promise<RawDirectoryRow[]>;
}

/**
 * One page of a searched and/or filtered listing (Day 17 -
 * docs/DAY17_DIRECTORY_FILTERS_NOTES.md). Re-normalises the query and
 * re-validates the filters defensively, refuses the plain directory (it has
 * its own path), and refuses a cursor that was not issued for this exact
 * listing - same search, same filters.
 */
export async function fetchListingPage(
  dataSource: DirectorySearchDataSource,
  listing: DirectoryListing,
  cursor: DirectoryCursor | null,
  pageSize: number = DIRECTORY_PAGE_SIZE,
): Promise<DirectoryPageResult> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new RangeError(`pageSize must be a positive integer, got ${pageSize}`);
  }
  const normalized: DirectoryListing = {
    q: listing.q === null ? null : normalizeSearchQuery(listing.q),
    filters: canonicalFilters(listing.filters),
  };
  if (isPlainDirectory(normalized)) {
    throw new RangeError("A listing needs a search term or at least one filter.");
  }
  const scope = listingScope(normalized);
  if (cursor !== null && cursor.scope !== scope) {
    throw new RangeError("This cursor was not issued for this listing.");
  }

  let rows: RawDirectoryRow[];
  try {
    rows = await dataSource.searchPublishedObjects(
      normalized.q,
      normalized.filters,
      cursor,
      pageSize + 1,
    );
  } catch (error) {
    throw new DirectoryQueryError("Failed to search the directory.", error);
  }

  return toPageResult(rows, pageSize, scope);
}

/** Day 16 entry point: a search with no filters. */
export async function fetchSearchPage(
  dataSource: DirectorySearchDataSource,
  rawQuery: string,
  cursor: DirectoryCursor | null,
  pageSize: number = DIRECTORY_PAGE_SIZE,
): Promise<DirectoryPageResult> {
  const q = normalizeSearchQuery(rawQuery);
  if (q === null) {
    throw new RangeError("A search needs at least one non-blank term.");
  }
  return fetchListingPage(dataSource, { q, filters: EMPTY_FILTERS }, cursor, pageSize);
}
