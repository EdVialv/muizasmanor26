/**
 * Historical-family filter options (docs/DAY18_CLASSIFICATION_FILTERS_NOTES.md):
 * verified family names of published objects, searched by name or alternate
 * spelling in the SECURITY INVOKER function
 * public_directory_historical_families() through the anon-key client - so
 * RLS decides what is counted.
 *
 * The list can grow to hundreds of names, so it is never loaded whole: the
 * picker asks for at most FAMILY_OPTIONS_LIMIT matches of what the visitor
 * typed, through the route handler in src/app/api/directory/families.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeFamily } from "./filters";

export const FAMILY_OPTIONS_FUNCTION = "public_directory_historical_families";
export const FAMILY_OPTIONS_PATH = "/api/directory/families";
/** Options shown at once; one more is requested to know whether there are more. */
export const FAMILY_OPTIONS_LIMIT = 20;
export const MAX_FAMILY_SEARCH_LENGTH = 100;

export interface FamilyOption {
  value: string;
  count: number;
}

export interface FamilyOptionsResult {
  options: FamilyOption[];
  /** True when more names match than were returned. */
  hasMore: boolean;
}

/** Trimmed, NFC-normalised and capped; null when empty (= list from the start). */
export function normalizeFamilySearch(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const value = Array.from(raw.normalize("NFC").trim()).slice(0, MAX_FAMILY_SEARCH_LENGTH).join("");
  return value.length > 0 ? value : null;
}

/** Latvian alphabetical order for display (the database orders by its own collation). */
const collator = new Intl.Collator("lv");

export async function fetchFamilyOptions(
  client: SupabaseClient,
  search: string | null,
): Promise<FamilyOptionsResult> {
  const { data, error } = await client.rpc(FAMILY_OPTIONS_FUNCTION, {
    search,
    row_limit: FAMILY_OPTIONS_LIMIT + 1,
  });
  if (error) {
    throw error;
  }
  const options: FamilyOption[] = [];
  for (const row of (data ?? []) as Array<{ family_name: unknown; object_count: unknown }>) {
    const value = typeof row.family_name === "string" ? normalizeFamily(row.family_name) : null;
    const count = Number(row.object_count);
    // A value the URL parser would reject could never be selected; skip it.
    if (value !== null && Number.isFinite(count) && count > 0) {
      options.push({ value, count });
    }
  }
  const hasMore = options.length > FAMILY_OPTIONS_LIMIT;
  return {
    options: options
      .slice(0, FAMILY_OPTIONS_LIMIT)
      .sort((a, b) => collator.compare(a.value, b.value)),
    hasMore,
  };
}

/** The browser-side URL for a family search. */
export function familyOptionsHref(search: string | null): string {
  const normalized = normalizeFamilySearch(search);
  return normalized
    ? `${FAMILY_OPTIONS_PATH}?${new URLSearchParams({ q: normalized }).toString()}`
    : FAMILY_OPTIONS_PATH;
}

/** Validates a JSON body from the route handler; anything unexpected becomes null. */
export function parseFamilyOptionsResponse(body: unknown): FamilyOptionsResult | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const { options, hasMore } = body as { options?: unknown; hasMore?: unknown };
  if (!Array.isArray(options) || typeof hasMore !== "boolean") {
    return null;
  }
  const valid: FamilyOption[] = [];
  for (const option of options.slice(0, FAMILY_OPTIONS_LIMIT)) {
    const value = option && typeof option.value === "string" ? normalizeFamily(option.value) : null;
    const count = option ? Number(option.count) : NaN;
    if (value !== null && Number.isFinite(count) && count > 0) {
      valid.push({ value, count });
    }
  }
  return { options: valid, hasMore };
}
