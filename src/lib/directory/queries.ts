/**
 * Data access for the Day 13 public directory (docs/DAY13_DIRECTORY_NOTES.md).
 *
 * This module is deliberately split from src/app/objects/page.tsx (the
 * presentation layer) so the pagination logic can be unit-tested against an
 * injected, in-memory DirectoryDataSource instead of a live Supabase
 * project - this session has no reachable Supabase instance, and
 * "if Supabase environment variables are absent during tests, tests must
 * use mocks or injected data-access functions; production code must not
 * silently substitute fake records" is an explicit Day 13 requirement.
 *
 * Keyset pagination strategy
 * ---------------------------
 * The directory orders published objects by (name_lv, id) ascending. A
 * single Supabase/PostgREST request cannot safely express "greater than
 * this (name_lv, id) pair" as one composite filter without hand-building an
 * or()/and() filter string and manually quoting name_lv's content (which can
 * itself contain commas and parentheses - see real titles such as
 * "Rundāles pils (ziemeļu spārns)"). That string-building is exactly the
 * kind of "becoming raw SQL"-shaped risk Day 13's brief warns the cursor
 * handling must avoid, and it cannot be verified against a live PostgREST
 * endpoint from this session. So the boundary is split into two simple,
 * single-column filters instead - both go through supabase-js's normal
 * per-column filter methods (.eq/.gt), which take the value as a parameter
 * and need no manual escaping at all:
 *
 *   1. rows with name_lv exactly equal to the cursor's name, with id greater
 *      than the cursor's id (the remaining tail of the cursor's own name
 *      group), ordered by id;
 *   2. rows with name_lv strictly greater than the cursor's name, ordered by
 *      (name_lv, id), limited to whatever count remains after (1).
 *
 * Concatenating (1) then (2) reproduces the exact same order a single
 * (name_lv, id) > (cursorName, cursorId) query would give, at the cost of up
 * to one extra small round trip per page. See "Decisions requiring Codex
 * review" in docs/DAY13_DIRECTORY_NOTES.md.
 */

import type { DirectoryCursor } from "./cursor";

export const DIRECTORY_PAGE_SIZE = 24;

export const HERITAGE_OBJECTS_TABLE = "heritage_objects";

/** Row shape as returned by the data source, before presentation mapping. */
export interface RawDirectoryRow {
  id: string;
  slug: string;
  name_lv: string;
  object_type: string;
  municipality: string | null;
  condition_category: string | null;
  ownership_type: string | null;
  /** Day 15. NULL means "not recorded". */
  public_access?: string | null;
  /**
   * Day 15: the embedded cover image - at most one row, because the query
   * filters the embed on is_primary and the table allows one cover per
   * object. Absent or empty when the object has no publishable cover.
   */
  object_images?: RawDirectoryCoverRow[] | null;
}

export interface RawDirectoryCoverRow {
  source_image_url: string;
  alt_text_lv: string | null;
}

export interface DirectoryCoverImage {
  /** Always https. */
  sourceUrl: string;
  altTextLv: string | null;
}

/** Presentation-ready shape consumed by HeritageObjectCard. */
export interface DirectoryObjectSummary {
  id: string;
  slug: string;
  nameLv: string;
  objectType: string;
  municipality: string | null;
  conditionCategory: string | null;
  ownershipType: string | null;
  /**
   * heritage_objects.public_access (Day 15 migration), or null when it is
   * not recorded. The card shows a tag only for a recorded value.
   */
  publicAccessStatus: string | null;
  /** The object's cover image, or null when it has none. */
  coverImage: DirectoryCoverImage | null;
}

export class DirectoryConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DirectoryConfigurationError";
  }
}

export class DirectoryQueryError extends Error {
  constructor(
    message: string,
    readonly cause: unknown,
  ) {
    super(message);
    this.name = "DirectoryQueryError";
  }
}

/**
 * The minimal data-access seam the pagination logic needs. A production
 * implementation is backed by Supabase (createSupabaseDirectoryDataSource,
 * in src/lib/directory/supabaseDataSource.ts); tests implement this
 * interface directly against an in-memory fixture array.
 */
export interface DirectoryDataSource {
  fetchFirstPage(limit: number): Promise<RawDirectoryRow[]>;
  fetchSameNameAfterId(name: string, afterId: string, limit: number): Promise<RawDirectoryRow[]>;
  fetchAfterName(name: string, limit: number): Promise<RawDirectoryRow[]>;
}

export interface DirectoryPageResult {
  items: DirectoryObjectSummary[];
  hasNextPage: boolean;
  /** Present only when hasNextPage is true: the cursor for the next page. */
  nextCursor: DirectoryCursor | null;
}

function toCoverImage(rows: RawDirectoryCoverRow[] | null | undefined): DirectoryCoverImage | null {
  const cover = rows?.[0];
  if (!cover || typeof cover.source_image_url !== "string") {
    return null;
  }
  try {
    if (new URL(cover.source_image_url).protocol !== "https:") {
      return null;
    }
  } catch {
    return null;
  }
  const alt = cover.alt_text_lv?.trim();
  return { sourceUrl: cover.source_image_url, altTextLv: alt ? alt : null };
}

function toSummary(row: RawDirectoryRow): DirectoryObjectSummary {
  return {
    id: row.id,
    slug: row.slug,
    nameLv: row.name_lv,
    objectType: row.object_type,
    municipality: row.municipality,
    conditionCategory: row.condition_category,
    ownershipType: row.ownership_type,
    publicAccessStatus: row.public_access ?? null,
    coverImage: toCoverImage(row.object_images),
  };
}

/**
 * Fetches one page of published heritage objects strictly after `cursor`
 * (or the first page, when cursor is null), requesting one extra row so the
 * caller can tell whether a next page exists without a separate count
 * query. Always requests exactly `pageSize` logical results; never performs
 * an unbounded select.
 */
export async function fetchDirectoryPage(
  dataSource: DirectoryDataSource,
  cursor: DirectoryCursor | null,
  pageSize: number = DIRECTORY_PAGE_SIZE,
): Promise<DirectoryPageResult> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new RangeError(`pageSize must be a positive integer, got ${pageSize}`);
  }

  const overfetchLimit = pageSize + 1;
  let rows: RawDirectoryRow[];

  try {
    if (cursor === null) {
      rows = await dataSource.fetchFirstPage(overfetchLimit);
    } else {
      const sameNameTail = await dataSource.fetchSameNameAfterId(
        cursor.name,
        cursor.id,
        overfetchLimit,
      );
      const remaining = overfetchLimit - sameNameTail.length;
      const afterNameRows =
        remaining > 0 ? await dataSource.fetchAfterName(cursor.name, remaining) : [];
      rows = [...sameNameTail, ...afterNameRows];
    }
  } catch (error) {
    throw new DirectoryQueryError("Failed to fetch the directory page.", error);
  }

  return toPageResult(rows, pageSize);
}

/**
 * Turns an over-fetched batch (up to pageSize + 1 rows, already in
 * (name_lv, id) order) into one page plus the cursor for the next. `scope`
 * is stamped into that cursor for a search (see cursor.ts), so the next
 * page can only ever be requested for the same search.
 */
export function toPageResult(
  rows: RawDirectoryRow[],
  pageSize: number,
  scope?: string,
): DirectoryPageResult {
  const hasNextPage = rows.length > pageSize;
  const pageRows = hasNextPage ? rows.slice(0, pageSize) : rows;
  const lastRow = pageRows[pageRows.length - 1];

  let nextCursor: DirectoryCursor | null = null;
  if (hasNextPage && lastRow) {
    nextCursor =
      scope === undefined
        ? { name: lastRow.name_lv, id: lastRow.id }
        : { name: lastRow.name_lv, id: lastRow.id, scope };
  }

  return { items: pageRows.map(toSummary), hasNextPage, nextCursor };
}
