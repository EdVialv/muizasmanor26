/**
 * Supabase-backed DirectoryDataSource (docs/DAY13_DIRECTORY_NOTES.md).
 *
 * Deliberately uses the public anon/publishable-key client (PostgREST),
 * never a direct Postgres connection: a direct connection (as used by
 * scripts/import/db.ts for the Day 10/11 import tooling) runs as a
 * privileged Postgres role and would bypass Row Level Security entirely,
 * which docs/ARCHITECTURE.md calls "a mandatory boundary, not an optional
 * hardening step." Querying through the anon-key client means the Day 9
 * `heritage_objects_select_published` RLS policy is the real boundary - the
 * `.eq("status", "published")` filters below are defence in depth, not the
 * only thing standing between this route and a draft record.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  DirectoryConfigurationError,
  HERITAGE_OBJECTS_TABLE,
  type DirectoryDataSource,
  type RawDirectoryRow,
} from "./queries";

/**
 * Day 15 adds public_access and the embedded cover image. The embed is
 * filtered to is_primary below, so each card gets at most one image row in
 * the same request as its object - no per-card image query.
 */
const SELECT_COLUMNS =
  "id, slug, name_lv, object_type, municipality, condition_category, ownership_type, public_access, object_images(source_image_url, alt_text_lv)";

const COVER_FILTER_COLUMN = "object_images.is_primary";

/**
 * Builds a data source from NEXT_PUBLIC_SUPABASE_URL and
 * NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (docs/SUPABASE_SETUP.md). Both are
 * safe to expose to browser code already - RLS, not key secrecy, is the
 * protection - but this is called only from server-side code (the /objects
 * Server Component), never bundled into client JS.
 *
 * Throws DirectoryConfigurationError when either variable is absent, rather
 * than silently returning an empty or fabricated data source: a missing
 * configuration is a real operational problem the error state should
 * surface (see src/app/objects/page.tsx), not something to paper over with
 * fake records.
 */
export function createDirectoryDataSourceFromEnv(): DirectoryDataSource {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new DirectoryConfigurationError(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must both be set to query the public directory.",
    );
  }

  const client = createClient(url, key, { auth: { persistSession: false } });
  return createSupabaseDirectoryDataSource(client);
}

/** Exported separately so tests can pass a client stub without real env vars. */
export function createSupabaseDirectoryDataSource(client: SupabaseClient): DirectoryDataSource {
  return {
    async fetchFirstPage(limit) {
      const { data, error } = await client
        .from(HERITAGE_OBJECTS_TABLE)
        .select(SELECT_COLUMNS)
        .eq("status", "published")
        .eq(COVER_FILTER_COLUMN, true)
        .order("name_lv", { ascending: true })
        .order("id", { ascending: true })
        .limit(limit);
      if (error) {
        throw error;
      }
      return (data ?? []) as unknown as RawDirectoryRow[];
    },

    async fetchSameNameAfterId(name, afterId, limit) {
      const { data, error } = await client
        .from(HERITAGE_OBJECTS_TABLE)
        .select(SELECT_COLUMNS)
        .eq("status", "published")
        .eq(COVER_FILTER_COLUMN, true)
        .eq("name_lv", name)
        .gt("id", afterId)
        .order("id", { ascending: true })
        .limit(limit);
      if (error) {
        throw error;
      }
      return (data ?? []) as unknown as RawDirectoryRow[];
    },

    async fetchAfterName(name, limit) {
      const { data, error } = await client
        .from(HERITAGE_OBJECTS_TABLE)
        .select(SELECT_COLUMNS)
        .eq("status", "published")
        .eq(COVER_FILTER_COLUMN, true)
        .gt("name_lv", name)
        .order("name_lv", { ascending: true })
        .order("id", { ascending: true })
        .limit(limit);
      if (error) {
        throw error;
      }
      return (data ?? []) as unknown as RawDirectoryRow[];
    },
  };
}
