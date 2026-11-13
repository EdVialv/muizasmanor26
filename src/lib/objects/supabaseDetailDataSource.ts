/**
 * Supabase-backed ObjectDetailDataSource (docs/DAY14_OBJECT_PAGES_NOTES.md).
 *
 * Uses the anon/publishable-key client from src/lib/supabase/publicClient.ts,
 * so the Day 9 RLS policies decide what is readable: only `published`
 * heritage objects, and child-table rows only for a published parent. Every
 * query here also filters on status itself, as defence in depth.
 *
 * Every filter value goes through supabase-js's per-column methods
 * (.eq/.limit), which send it as its own encoded parameter. No value from
 * the URL is ever interpolated into a filter string.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { HERITAGE_OBJECTS_TABLE } from "@/lib/directory/queries";
import { createPublicSupabaseClient } from "@/lib/supabase/publicClient";
import type {
  ObjectDetailDataSource,
  RawObjectDetailRow,
  RawOwnerFamilyRow,
  RawRelatedObjectRow,
} from "./detail";

export const OWNER_FAMILIES_TABLE = "object_historical_owner_families";

const DETAIL_COLUMNS =
  "id, slug, name_lv, object_type, summary_lv, municipality, latitude, longitude, condition_category, condition_notes_lv, ownership_type, parent_object_id";

const RELATED_COLUMNS = "id, slug, name_lv, object_type";

const OWNER_FAMILY_COLUMNS = "family_name, start_year_approx, end_year_approx";

/** Throws PublicDataConfigurationError when the Supabase env vars are absent. */
export function createObjectDetailDataSourceFromEnv(): ObjectDetailDataSource {
  return createSupabaseObjectDetailDataSource(createPublicSupabaseClient());
}

/** Exported separately so tests can pass a client stub without real env vars. */
export function createSupabaseObjectDetailDataSource(
  client: SupabaseClient,
): ObjectDetailDataSource {
  return {
    async fetchPublishedObjectBySlug(slug) {
      const { data, error } = await client
        .from(HERITAGE_OBJECTS_TABLE)
        .select(DETAIL_COLUMNS)
        .eq("status", "published")
        .eq("slug", slug)
        .limit(1);
      if (error) {
        throw error;
      }
      const rows = (data ?? []) as RawObjectDetailRow[];
      return rows[0] ?? null;
    },

    async fetchPublishedObjectById(id) {
      const { data, error } = await client
        .from(HERITAGE_OBJECTS_TABLE)
        .select(RELATED_COLUMNS)
        .eq("status", "published")
        .eq("id", id)
        .limit(1);
      if (error) {
        throw error;
      }
      const rows = (data ?? []) as RawRelatedObjectRow[];
      return rows[0] ?? null;
    },

    async fetchPublishedChildren(parentId, limit) {
      const { data, error } = await client
        .from(HERITAGE_OBJECTS_TABLE)
        .select(RELATED_COLUMNS)
        .eq("status", "published")
        .eq("parent_object_id", parentId)
        .order("name_lv", { ascending: true })
        .order("id", { ascending: true })
        .limit(limit);
      if (error) {
        throw error;
      }
      return (data ?? []) as RawRelatedObjectRow[];
    },

    async fetchVerifiedOwnerFamilies(objectId, limit) {
      const { data, error } = await client
        .from(OWNER_FAMILIES_TABLE)
        .select(OWNER_FAMILY_COLUMNS)
        .eq("object_id", objectId)
        .eq("verification_status", "verified")
        .order("start_year_approx", { ascending: true, nullsFirst: false })
        .order("family_name", { ascending: true })
        .limit(limit);
      if (error) {
        throw error;
      }
      return (data ?? []) as RawOwnerFamilyRow[];
    },
  };
}
