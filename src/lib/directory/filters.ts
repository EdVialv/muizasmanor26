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
 * Day 18 (docs/DAY18_CLASSIFICATION_FILTERS_NOTES.md):
 *
 *   condition       heritage_objects.condition_category, or `unknown` (NULL)
 *   ownership       private | public (DATA_MODEL.md ownership groups), or
 *                   `unknown` (ownership_type NULL)
 *   family          a verified historical-family name, exact (free text)
 *   family_unknown  `1`: objects with no verified family association
 *
 * Within the Day 18 filters "unknown" is one more OR-ed choice: selecting a
 * known value never matches a missing one, selecting `unknown` matches only
 * missing ones, and both together match either.
 *
 * Every value is validated: unknown enum values are dropped, region and
 * family values are trimmed, NFC-normalised and bounded in length and
 * number, duplicates are removed, and the result is put in a canonical
 * order - so one listing has exactly one URL and one cursor scope.
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

/** The "unknown / not recorded" choice of the condition and ownership filters. */
export const UNKNOWN_VALUE = "unknown" as const;

/** condition_category values in docs/DATA_MODEL.md order, then "unknown". */
export const CONDITION_VALUES = [
  "historical_site",
  "damaged",
  "class_b",
  "class_a",
  UNKNOWN_VALUE,
] as const;

/** docs/DATA_MODEL.md "Ownership filter groups", then "unknown". */
export const OWNERSHIP_VALUES = ["private", "public", UNKNOWN_VALUE] as const;

export type ObjectTypeValue = (typeof OBJECT_TYPE_VALUES)[number];
export type PublicAccessValue = (typeof PUBLIC_ACCESS_VALUES)[number];
export type ServiceValue = (typeof SERVICE_VALUES)[number];
export type ConditionValue = (typeof CONDITION_VALUES)[number];
export type OwnershipValue = (typeof OWNERSHIP_VALUES)[number];

export interface DirectoryFilters {
  types: ObjectTypeValue[];
  regions: string[];
  access: PublicAccessValue[];
  services: ServiceValue[];
  conditions: ConditionValue[];
  ownership: OwnershipValue[];
  families: string[];
  /** Objects with no verified historical-family association. */
  familyUnknown: boolean;
}

export const MAX_REGIONS = 10;
export const MAX_REGION_LENGTH = 120;
export const MAX_FAMILIES = 10;
export const MAX_FAMILY_LENGTH = 120;

export const FILTER_PARAM_KEYS = {
  types: "type",
  regions: "region",
  access: "access",
  services: "service",
  conditions: "condition",
  ownership: "ownership",
  families: "family",
  familyUnknown: "family_unknown",
} as const;

/** The only accepted value of family_unknown. */
export const FAMILY_UNKNOWN_FLAG = "1";

export const EMPTY_FILTERS: DirectoryFilters = {
  types: [],
  regions: [],
  access: [],
  services: [],
  conditions: [],
  ownership: [],
  families: [],
  familyUnknown: false,
};

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

/**
 * The canonical family name: Unicode NFC, then leading and trailing
 * whitespace removed (String.prototype.trim()). This must stay identical to
 * the database's canonical_family_name() (Day 18 migration, decision 8),
 * which every family query compares - so a name stored as "  Ābele " is
 * offered, put in the URL and matched as "Ābele". Null when empty or too
 * long.
 */
export function normalizeFamily(raw: string): string | null {
  const value = raw.normalize("NFC").trim();
  if (value.length === 0 || Array.from(value).length > MAX_FAMILY_LENGTH) {
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

/** Free-text values: normalised, deduplicated, code-point sorted and capped. */
function pickTexts(values: string[], normalize: (raw: string) => string | null, max: number) {
  const normalized = values.map(normalize);
  const valid = [...new Set(normalized.filter((value): value is string => value !== null))].sort(
    compareCodePoints,
  );
  return {
    kept: valid.slice(0, max),
    dropped: normalized.some((value) => value === null) || valid.length > max,
  };
}

export function parseFilters(params: ParamsInput): ParsedFilters {
  const types = pickKnown(readAll(params, FILTER_PARAM_KEYS.types), OBJECT_TYPE_VALUES);
  const access = pickKnown(readAll(params, FILTER_PARAM_KEYS.access), PUBLIC_ACCESS_VALUES);
  const services = pickKnown(readAll(params, FILTER_PARAM_KEYS.services), SERVICE_VALUES);
  const conditions = pickKnown(readAll(params, FILTER_PARAM_KEYS.conditions), CONDITION_VALUES);
  const ownership = pickKnown(readAll(params, FILTER_PARAM_KEYS.ownership), OWNERSHIP_VALUES);
  const regions = pickTexts(
    readAll(params, FILTER_PARAM_KEYS.regions),
    normalizeRegion,
    MAX_REGIONS,
  );
  const families = pickTexts(
    readAll(params, FILTER_PARAM_KEYS.families),
    normalizeFamily,
    MAX_FAMILIES,
  );
  const rawFamilyUnknown = readAll(params, FILTER_PARAM_KEYS.familyUnknown);
  const familyUnknown = rawFamilyUnknown.includes(FAMILY_UNKNOWN_FLAG);
  const familyUnknownDropped = rawFamilyUnknown.some((value) => value !== FAMILY_UNKNOWN_FLAG);

  return {
    filters: {
      types: types.kept,
      regions: regions.kept,
      access: access.kept,
      services: services.kept,
      conditions: conditions.kept,
      ownership: ownership.kept,
      families: families.kept,
      familyUnknown,
    },
    hadInvalidValues:
      types.dropped ||
      access.dropped ||
      services.dropped ||
      regions.dropped ||
      conditions.dropped ||
      ownership.dropped ||
      families.dropped ||
      familyUnknownDropped,
  };
}

export function hasActiveFilters(filters: DirectoryFilters): boolean {
  return countActiveFilters(filters) > 0;
}

export function countActiveFilters(filters: DirectoryFilters): number {
  return (
    filters.types.length +
    filters.regions.length +
    filters.access.length +
    filters.services.length +
    filters.conditions.length +
    filters.ownership.length +
    filters.families.length +
    (filters.familyUnknown ? 1 : 0)
  );
}

/** Canonical [key, value] pairs, in a fixed order. */
export function filtersToEntries(filters: DirectoryFilters): Array<[string, string]> {
  const entries = (key: string, values: readonly string[]) =>
    values.map((value): [string, string] => [key, value]);
  return [
    ...entries(FILTER_PARAM_KEYS.types, filters.types),
    ...entries(FILTER_PARAM_KEYS.regions, filters.regions),
    ...entries(FILTER_PARAM_KEYS.access, filters.access),
    ...entries(FILTER_PARAM_KEYS.services, filters.services),
    ...entries(FILTER_PARAM_KEYS.conditions, filters.conditions),
    ...entries(FILTER_PARAM_KEYS.ownership, filters.ownership),
    ...entries(FILTER_PARAM_KEYS.families, filters.families),
    ...(filters.familyUnknown
      ? [[FILTER_PARAM_KEYS.familyUnknown, FAMILY_UNKNOWN_FLAG] as [string, string]]
      : []),
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
