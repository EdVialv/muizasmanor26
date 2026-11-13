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
  DIRECTORY_PAGE_SIZE,
  DirectoryQueryError,
  toPageResult,
  type DirectoryPageResult,
  type RawDirectoryRow,
} from "./queries";
import { normalizeSearchQuery, searchScope } from "./searchQuery";

export interface DirectorySearchDataSource {
  /**
   * Up to `limit` published objects matching `query`, in (name_lv, id)
   * order, strictly after `after` when given. `query` is already
   * normalised.
   */
  searchPublishedObjects(
    query: string,
    after: DirectoryCursor | null,
    limit: number,
  ): Promise<RawDirectoryRow[]>;
}

/**
 * One page of search results. Re-normalises the query defensively (a
 * caller passing raw input still gets bounded, canonical input to the
 * database) and refuses a cursor that was not issued for this exact search.
 */
export async function fetchSearchPage(
  dataSource: DirectorySearchDataSource,
  rawQuery: string,
  cursor: DirectoryCursor | null,
  pageSize: number = DIRECTORY_PAGE_SIZE,
): Promise<DirectoryPageResult> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new RangeError(`pageSize must be a positive integer, got ${pageSize}`);
  }
  const query = normalizeSearchQuery(rawQuery);
  if (query === null) {
    throw new RangeError("A search needs at least one non-blank term.");
  }
  const scope = searchScope(query);
  if (cursor !== null && cursor.scope !== scope) {
    throw new RangeError("This cursor was not issued for this search.");
  }

  let rows: RawDirectoryRow[];
  try {
    rows = await dataSource.searchPublishedObjects(query, cursor, pageSize + 1);
  } catch (error) {
    throw new DirectoryQueryError("Failed to search the directory.", error);
  }

  return toPageResult(rows, pageSize, scope);
}
