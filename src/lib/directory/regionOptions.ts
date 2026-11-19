/**
 * Region filter options (docs/DAY17_DIRECTORY_FILTERS_NOTES.md): every
 * distinct stored municipality of a published object, with its count, from
 * the SECURITY INVOKER function public_directory_municipalities() - read
 * through the anon-key client, so RLS decides what is counted.
 *
 * "Region" is the stored municipality text: the schema has no other
 * geographic classification and no code behind this one.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createPublicSupabaseClient } from "@/lib/supabase/publicClient";
import { normalizeRegion } from "./filters";

export const REGION_OPTIONS_FUNCTION = "public_directory_municipalities";
/** Far above the 119 municipalities in the local test data; keeps the response bounded. */
export const MAX_REGION_OPTIONS = 500;

export interface RegionOption {
  value: string;
  count: number;
}

export async function fetchRegionOptions(client: SupabaseClient): Promise<RegionOption[]> {
  const { data, error } = await client.rpc(REGION_OPTIONS_FUNCTION).limit(MAX_REGION_OPTIONS);
  if (error) {
    throw error;
  }
  const options: RegionOption[] = [];
  for (const row of (data ?? []) as Array<{ municipality: unknown; object_count: unknown }>) {
    const value = typeof row.municipality === "string" ? normalizeRegion(row.municipality) : null;
    const count = Number(row.object_count);
    // A value the URL parser would reject could never be selected; skip it.
    if (value !== null && Number.isFinite(count) && count > 0) {
      options.push({ value, count });
    }
  }
  return options;
}

/** Null when the options cannot be loaded - the panel then explains, and other filters still work. */
export async function loadRegionOptionsFromEnv(): Promise<RegionOption[] | null> {
  try {
    return await fetchRegionOptions(createPublicSupabaseClient());
  } catch (error) {
    console.error("[objects] region options could not be loaded:", error);
    return null;
  }
}
