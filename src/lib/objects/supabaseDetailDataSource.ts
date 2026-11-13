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
import {
  MAX_OBJECT_CONTACTS,
  MAX_OBJECT_IMAGES,
  type ObjectDetailDataSource,
  type RawObjectDetailRow,
  type RawOwnerFamilyRow,
  type RawRelatedObjectRow,
} from "./detail";

export const OWNER_FAMILIES_TABLE = "object_historical_owner_families";

export const OBJECT_IMAGES_TABLE = "object_images";
export const OBJECT_CONTACTS_TABLE = "object_contacts";

/**
 * Exactly the object_images columns the Day 15 migration grants to anon.
 * Asking for any other column (or `*`) is refused by the database.
 */
export const PUBLIC_IMAGE_COLUMNS =
  "id, source_image_url, alt_text_lv, caption_lv, credit, license_name, license_url, source_attribution_note, is_primary, sort_order";

const PUBLIC_CONTACT_COLUMNS = "contact_type, label, contact_value, is_primary, verified_at";

/**
 * One request returns the object with its images and public contacts
 * embedded (PostgREST resource embedding over the object_id foreign keys),
 * so the page needs no follow-up query for either.
 */
const DETAIL_COLUMNS = [
  "id, slug, name_lv, object_type, summary_lv, municipality, latitude, longitude",
  "condition_category, condition_notes_lv, ownership_type, ownership_verified_at, parent_object_id",
  "source_url, last_verified_at",
  "public_access, public_access_notes_lv, accessibility, accessibility_notes_lv, access_verified_at",
  `${OBJECT_IMAGES_TABLE}(${PUBLIC_IMAGE_COLUMNS})`,
  `${OBJECT_CONTACTS_TABLE}(${PUBLIC_CONTACT_COLUMNS})`,
].join(", ");

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
        // Defence in depth: RLS already returns only public contacts.
        .eq(`${OBJECT_CONTACTS_TABLE}.visibility`, "public")
        .order("is_primary", { referencedTable: OBJECT_IMAGES_TABLE, ascending: false })
        .order("sort_order", { referencedTable: OBJECT_IMAGES_TABLE, ascending: true })
        .order("id", { referencedTable: OBJECT_IMAGES_TABLE, ascending: true })
        // One more than is shown, so the page can say when there are more.
        .limit(MAX_OBJECT_IMAGES + 1, { referencedTable: OBJECT_IMAGES_TABLE })
        .order("is_primary", { referencedTable: OBJECT_CONTACTS_TABLE, ascending: false })
        .order("label", { referencedTable: OBJECT_CONTACTS_TABLE, ascending: true })
        .limit(MAX_OBJECT_CONTACTS, { referencedTable: OBJECT_CONTACTS_TABLE })
        .limit(1);
      if (error) {
        throw error;
      }
      const rows = (data ?? []) as unknown as RawObjectDetailRow[];
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
