/**
 * Directory filters: the URL model shared by the server and the browser
 * (docs/DAY17_DIRECTORY_FILTERS_NOTES.md).
 *
 * Pure and dependency-free, like searchQuery.ts: the page, the filter panel
 * and the search field must agree exactly on what a URL means.
 *
 * URL parameters (each may repeat; values within one are ORed, different
 * parameters are ANDed):
 *
 *   type     heritage_objects.object_type          (controlled enum)
 *   region   heritage_objects.municipality, exact  (stored free text)
 *   access   heritage_objects.public_access        (controlled enum)
 *   service  accommodation | catering | events     (each must be recorded true)
 *
 * Every value is validated: unknown enum values are dropped, region values
 * are trimmed, NFC-normalised and bounded in length and number, duplicates
 * are removed, and the result is put in a canonical order - so one listing
 * has exactly one URL and one cursor scope.
 */

import { normalizeSearchQuery, searchScope } from "./searchQuery";

export const OBJECT_TYPE_VALUES = [
  "manor_estate",
  "manor_house",
  "palace_or_castle",
  "park_or_garden",
  "ruin_or_historical_site",
  "outbuilding",
  "other_heritage_object",
] as const;

export const PUBLIC_ACCESS_VALUES = [
  "open",
  "by_appointment",
  "exterior_only",
  "not_accessible",
] as const;

/** URL values for the three service filters, in display order. */
export const SERVICE_VALUES = ["accommodation", "catering", "events"] as const;

export type ObjectTypeValue = (typeof OBJECT_TYPE_VALUES)[number];
export type PublicAccessValue = (typeof PUBLIC_ACCESS_VALUES)[number];
export type ServiceValue = (typeof SERVICE_VALUES)[number];

export interface DirectoryFilters {
  types: ObjectTypeValue[];
  regions: string[];
  access: PublicAccessValue[];
  services: ServiceValue[];
}

export const MAX_REGIONS = 10;
export const MAX_REGION_LENGTH = 120;

export const FILTER_PARAM_KEYS = {
  types: "type",
  regions: "region",
  access: "access",
  services: "service",
} as const;

export const EMPTY_FILTERS: DirectoryFilters = { types: [], regions: [], access: [], services: [] };

/** A plain object of search params (Next.js page props) or a URLSearchParams. */
export type ParamsInput =
  URLSearchParams | Record<string, string | string[] | undefined> | null | undefined;

/**
 * Every value of one parameter. Blank values are treated as absent, not as
 * invalid: a no-JavaScript form submits an empty `region=` for an untouched
 * select, and that must not be reported as a broken link.
 */
function readAll(params: ParamsInput, key: string): string[] {
  if (!params) {
    return [];
  }
  let values: string[];
  if (params instanceof URLSearchParams) {
    values = params.getAll(key);
  } else {
    const value = params[key];
    values = value === undefined ? [] : Array.isArray(value) ? value : [value];
  }
  return values.filter((value) => value.trim().length > 0);
}

function pickKnown<T extends string>(values: string[], known: readonly T[]) {
  const wanted = new Set(values);
  const kept = known.filter((value) => wanted.has(value));
  const dropped = [...wanted].some((value) => !(known as readonly string[]).includes(value));
  return { kept, dropped };
}

export function normalizeRegion(raw: string): string | null {
  const value = raw.normalize("NFC").trim();
  if (value.length === 0 || Array.from(value).length > MAX_REGION_LENGTH) {
    return null;
  }
  return value;
}

/** Code-point order: identical on server and browser, unlike locale collation. */
function compareCodePoints(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface ParsedFilters {
  filters: DirectoryFilters;
  /** True when the URL held a value that was dropped as unknown or out of bounds. */
  hadInvalidValues: boolean;
}

export function parseFilters(params: ParamsInput): ParsedFilters {
  const types = pickKnown(readAll(params, FILTER_PARAM_KEYS.types), OBJECT_TYPE_VALUES);
  const access = pickKnown(readAll(params, FILTER_PARAM_KEYS.access), PUBLIC_ACCESS_VALUES);
  const services = pickKnown(readAll(params, FILTER_PARAM_KEYS.services), SERVICE_VALUES);

  const rawRegions = readAll(params, FILTER_PARAM_KEYS.regions);
  const normalizedRegions = rawRegions.map(normalizeRegion);
  const validRegions = [
    ...new Set(normalizedRegions.filter((region): region is string => region !== null)),
  ].sort(compareCodePoints);
  const regions = validRegions.slice(0, MAX_REGIONS);
  const regionsDropped =
    normalizedRegions.some((region) => region === null) || validRegions.length > MAX_REGIONS;

  return {
    filters: { types: types.kept, regions, access: access.kept, services: services.kept },
    hadInvalidValues: types.dropped || access.dropped || services.dropped || regionsDropped,
  };
}

export function hasActiveFilters(filters: DirectoryFilters): boolean {
  return (
    filters.types.length > 0 ||
    filters.regions.length > 0 ||
    filters.access.length > 0 ||
    filters.services.length > 0
  );
}

export function countActiveFilters(filters: DirectoryFilters): number {
  return (
    filters.types.length + filters.regions.length + filters.access.length + filters.services.length
  );
}

/** Canonical [key, value] pairs, in a fixed order. */
export function filtersToEntries(filters: DirectoryFilters): Array<[string, string]> {
  return [
    ...filters.types.map((value): [string, string] => [FILTER_PARAM_KEYS.types, value]),
    ...filters.regions.map((value): [string, string] => [FILTER_PARAM_KEYS.regions, value]),
    ...filters.access.map((value): [string, string] => [FILTER_PARAM_KEYS.access, value]),
    ...filters.services.map((value): [string, string] => [FILTER_PARAM_KEYS.services, value]),
  ];
}

/** Re-validates and re-orders, so any filter set built in code is canonical too. */
export function canonicalFilters(filters: DirectoryFilters): DirectoryFilters {
  return parseFilters(new URLSearchParams(filtersToEntries(filters))).filters;
}

export function filtersEqual(a: DirectoryFilters, b: DirectoryFilters): boolean {
  return (
    new URLSearchParams(filtersToEntries(canonicalFilters(a))).toString() ===
    new URLSearchParams(filtersToEntries(canonicalFilters(b))).toString()
  );
}

/** One listing of the directory: an optional search plus filters. */
export interface DirectoryListing {
  q: string | null;
  filters: DirectoryFilters;
}

export function isPlainDirectory(listing: DirectoryListing): boolean {
  return listing.q === null && !hasActiveFilters(listing.filters);
}

/**
 * The cursor scope of a listing (see cursor.ts): undefined for the plain
 * directory; for a search alone, the Day 16 scope of the query; otherwise
 * a fingerprint of the query and the canonical filters together. Any change
 * to the search or the filters therefore changes the scope, and a cursor
 * from the old listing is refused.
 */
export function listingScope(listing: DirectoryListing): string | undefined {
  if (isPlainDirectory(listing)) {
    return undefined;
  }
  if (!hasActiveFilters(listing.filters)) {
    return searchScope(listing.q ?? "");
  }
  const filterKey = new URLSearchParams(filtersToEntries(canonicalFilters(listing.filters)));
  return searchScope(`${listing.q ?? ""}\u0000${filterKey.toString()}`);
}

/** Reads a whole listing (search + filters) from URL parameters. */
export function parseListing(
  params: ParamsInput,
): DirectoryListing & { hadInvalidValues: boolean } {
  const rawQ = readAll(params, "q");
  const q = rawQ.length === 1 ? normalizeSearchQuery(rawQ[0]) : null;
  const { filters, hadInvalidValues } = parseFilters(params);
  return { q, filters, hadInvalidValues };
}

/** The canonical query string of a listing, optionally with a cursor. */
export function listingSearchParams(listing: DirectoryListing, cursor?: string): URLSearchParams {
  const params = new URLSearchParams();
  if (listing.q) {
    params.set("q", listing.q);
  }
  for (const [key, value] of filtersToEntries(canonicalFilters(listing.filters))) {
    params.append(key, value);
  }
  if (cursor) {
    params.set("cursor", cursor);
  }
  return params;
}

/** The URL of a listing. A changed listing never carries a cursor unless one is passed. */
export function buildListingHref(
  pathname: string,
  listing: DirectoryListing,
  cursor?: string,
): string {
  const query = listingSearchParams(listing, cursor).toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** A stable string identity for a listing, for comparing URL states. */
export function listingKey(listing: DirectoryListing): string {
  return listingSearchParams(listing).toString();
}
