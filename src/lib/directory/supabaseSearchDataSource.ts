/**
 * Supabase-backed DirectorySearchDataSource (docs/DAY16_SEARCH_NOTES.md).
 *
 * Calls one database function, search_public_heritage_objects, through the
 * anon/publishable-key client - for a search, for filters (Days 17-18), or both
 * at once, in one query. The query, the filters and the keyset position
 * travel as named RPC arguments - JSON values bound as function parameters - so no
 * user input is ever spliced into SQL or into a PostgREST filter string.
 * The function is SECURITY INVOKER: every row it returns is read under the
 * caller's Row Level Security, exactly like the plain directory.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createPublicSupabaseClient,
  PublicDataConfigurationError,
} from "@/lib/supabase/publicClient";
import type { DirectoryFilters } from "./filters";
import { DirectoryConfigurationError, type RawDirectoryRow } from "./queries";
import type { DirectorySearchDataSource } from "./search";

export const SEARCH_FUNCTION = "search_public_heritage_objects";

/** The function's result row (supabase/migrations/20261115090000_directory_classification_filters.sql). */
interface RawSearchRow {
  id: string;
  slug: string;
  name_lv: string;
  object_type: string;
  municipality: string | null;
  condition_category: string | null;
  ownership_type: string | null;
  public_access: string | null;
  cover_image_url: string | null;
  cover_image_alt_lv: string | null;
}

function toDirectoryRow(row: RawSearchRow): RawDirectoryRow {
  return {
    id: row.id,
    slug: row.slug,
    name_lv: row.name_lv,
    object_type: row.object_type,
    municipality: row.municipality,
    condition_category: row.condition_category,
    ownership_type: row.ownership_type,
    public_access: row.public_access,
    object_images: row.cover_image_url
      ? [{ source_image_url: row.cover_image_url, alt_text_lv: row.cover_image_alt_lv }]
      : [],
  };
}

/**
 * Throws DirectoryConfigurationError when the Supabase env vars are absent,
 * so the directory page reports search and browsing failures the same way.
 */
export function createDirectorySearchDataSourceFromEnv(): DirectorySearchDataSource {
  try {
    return createSupabaseDirectorySearchDataSource(createPublicSupabaseClient());
  } catch (error) {
    if (error instanceof PublicDataConfigurationError) {
      throw new DirectoryConfigurationError(error.message);
    }
    throw error;
  }
}

/**
 * The search and filter arguments shared by every directory RPC - the list
 * (search_public_heritage_objects) and the Day 19 map (public_map_objects) -
 * so the two views always send the same selection in the same form.
 */
export function listingRpcArgs(query: string | null, filters: DirectoryFilters) {
  return {
    search_query: query,
    // Empty categories are sent as null: "no filter on this category".
    object_types: filters.types.length > 0 ? filters.types : null,
    municipalities: filters.regions.length > 0 ? filters.regions : null,
    access_types: filters.access.length > 0 ? filters.access : null,
    accommodation: filters.services.includes("accommodation"),
    catering: filters.services.includes("catering"),
    event_facilities: filters.services.includes("events"),
    // Day 18: "unknown" travels as a value of its own (condition,
    // ownership) or as a flag (family), so the function can tell
    // "no filter" from "only objects where this is not recorded".
    condition_categories: filters.conditions.length > 0 ? filters.conditions : null,
    ownership_groups: filters.ownership.length > 0 ? filters.ownership : null,
    historical_families: filters.families.length > 0 ? filters.families : null,
    family_unknown: filters.familyUnknown,
  };
}

/** Exported separately so tests can pass a client stub without real env vars. */
export function createSupabaseDirectorySearchDataSource(
  client: SupabaseClient,
): DirectorySearchDataSource {
  return {
    async searchPublishedObjects(query, filters, after, limit) {
      const { data, error } = await client.rpc(SEARCH_FUNCTION, {
        ...listingRpcArgs(query, filters),
        after_name: after?.name ?? null,
        after_id: after?.id ?? null,
        page_size: limit,
      });
      if (error) {
        throw error;
      }
      return ((data ?? []) as RawSearchRow[]).map(toDirectoryRow);
    },
  };
}
