import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
  MAX_FAMILIES,
  MAX_FAMILY_LENGTH,
  MAX_REGION_LENGTH,
  MAX_REGIONS,
  buildListingHref,
  canonicalFilters,
  countActiveFilters,
  filtersEqual,
  hasActiveFilters,
  isPlainDirectory,
  listingKey,
  listingScope,
  parseFilters,
  parseListing,
} from "./filters";
import { searchScope } from "./searchQuery";

describe("parseFilters", () => {
  it("reads each filter parameter, repeated values included", () => {
    const { filters, hadInvalidValues } = parseFilters(
      new URLSearchParams(
        "type=palace_or_castle&type=manor_estate&region=Cēsu novads&access=open&service=catering&service=accommodation",
      ),
    );

    expect(filters).toEqual({
      ...EMPTY_FILTERS,
      types: ["manor_estate", "palace_or_castle"],
      regions: ["Cēsu novads"],
      access: ["open"],
      services: ["accommodation", "catering"],
    });
    expect(hadInvalidValues).toBe(false);
  });

  it("accepts Next.js page searchParams objects as well as URLSearchParams", () => {
    expect(
      parseFilters({ type: ["park_or_garden", "outbuilding"], service: "events" }).filters,
    ).toEqual({
      ...EMPTY_FILTERS,
      types: ["park_or_garden", "outbuilding"],
      regions: [],
      access: [],
      services: ["events"],
    });
  });

  it("drops unknown values and says so", () => {
    const { filters, hadInvalidValues } = parseFilters(
      new URLSearchParams(
        "type=castle&type=palace_or_castle&access=public&service=spa&service=catering",
      ),
    );

    expect(filters).toEqual({
      ...EMPTY_FILTERS,
      types: ["palace_or_castle"],
      regions: [],
      access: [],
      services: ["catering"],
    });
    expect(hadInvalidValues).toBe(true);
  });

  it("keeps public access apart from ownership: ownership values are not access values", () => {
    const { filters, hadInvalidValues } = parseFilters(
      new URLSearchParams("access=state&access=municipality"),
    );
    expect(filters.access).toEqual([]);
    expect(hadInvalidValues).toBe(true);
  });

  it("treats blank values as absent, not as invalid (a no-JavaScript form sends region=)", () => {
    const { filters, hadInvalidValues } = parseFilters(new URLSearchParams("region=&type=  "));
    expect(filters).toEqual(EMPTY_FILTERS);
    expect(hadInvalidValues).toBe(false);
  });

  it("trims, NFC-normalises, de-duplicates and orders regions", () => {
    const { filters } = parseFilters(
      new URLSearchParams([
        ["region", "  Cēsu novads "],
        ["region", "Cēsu novads"],
        ["region", "Bauskas novads"],
      ]),
    );
    expect(filters.regions).toEqual(["Bauskas novads", "Cēsu novads"]);
  });

  it(`bounds regions: at most ${MAX_REGIONS}, each at most ${MAX_REGION_LENGTH} characters`, () => {
    const many = new URLSearchParams(
      Array.from({ length: MAX_REGIONS + 3 }, (_, i): [string, string] => [
        "region",
        `Novads ${String(i).padStart(2, "0")}`,
      ]),
    );
    const tooMany = parseFilters(many);
    expect(tooMany.filters.regions).toHaveLength(MAX_REGIONS);
    expect(tooMany.hadInvalidValues).toBe(true);

    const tooLong = parseFilters(
      new URLSearchParams([["region", "x".repeat(MAX_REGION_LENGTH + 1)]]),
    );
    expect(tooLong.filters.regions).toEqual([]);
    expect(tooLong.hadInvalidValues).toBe(true);
  });
});

describe("filter set helpers", () => {
  it("counts and detects active filters", () => {
    const filters = canonicalFilters({
      ...EMPTY_FILTERS,
      types: ["manor_estate"],
      regions: ["Cēsu novads"],
      access: [],
      services: ["events"],
    });
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters(filters)).toBe(true);
    expect(countActiveFilters(filters)).toBe(3);
  });

  it("compares filter sets regardless of the order values were chosen in", () => {
    expect(
      filtersEqual(
        {
          ...EMPTY_FILTERS,
          types: ["palace_or_castle", "manor_estate"],
          regions: [],
          access: [],
          services: [],
        },
        {
          ...EMPTY_FILTERS,
          types: ["manor_estate", "palace_or_castle"],
          regions: [],
          access: [],
          services: [],
        },
      ),
    ).toBe(true);
  });
});

describe("listings, URLs and cursor scope", () => {
  const filters = canonicalFilters({
    ...EMPTY_FILTERS,
    types: ["palace_or_castle"],
    regions: [],
    access: ["open"],
    services: [],
  });

  it("builds one canonical URL per listing, with the cursor only when one is given", () => {
    expect(buildListingHref("/objects", { q: null, filters: EMPTY_FILTERS })).toBe("/objects");
    expect(buildListingHref("/objects", { q: "pils", filters })).toBe(
      "/objects?q=pils&type=palace_or_castle&access=open",
    );
    expect(buildListingHref("/objects", { q: "pils", filters }, "abc")).toBe(
      "/objects?q=pils&type=palace_or_castle&access=open&cursor=abc",
    );
  });

  it("parses a URL back into the same listing", () => {
    const listing = parseListing(
      new URLSearchParams("access=open&q=%20pils%20&type=palace_or_castle"),
    );
    expect(listing.q).toBe("pils");
    expect(listing.filters).toEqual(filters);
    expect(listingKey(listing)).toBe("q=pils&type=palace_or_castle&access=open");
  });

  it("ignores a repeated q rather than guessing which one was meant", () => {
    expect(parseListing(new URLSearchParams("q=a&q=b")).q).toBeNull();
  });

  it("gives the plain directory no scope, and a search alone its Day 16 scope", () => {
    expect(isPlainDirectory({ q: null, filters: EMPTY_FILTERS })).toBe(true);
    expect(listingScope({ q: null, filters: EMPTY_FILTERS })).toBeUndefined();
    expect(listingScope({ q: "pils", filters: EMPTY_FILTERS })).toBe(searchScope("pils"));
  });

  it("changes the scope whenever the search or any filter changes", () => {
    const scopes = new Set([
      listingScope({ q: "pils", filters: EMPTY_FILTERS }),
      listingScope({ q: "pils", filters }),
      listingScope({ q: null, filters }),
      listingScope({ q: "muiza", filters }),
      listingScope({ q: "pils", filters: { ...filters, services: ["catering"] } }),
      listingScope({ q: "pils", filters: { ...filters, access: ["open", "by_appointment"] } }),
    ]);
    expect(scopes.size).toBe(6);
  });

  it("gives the same scope to the same filters chosen in a different order", () => {
    expect(
      listingScope({
        q: null,
        filters: {
          ...EMPTY_FILTERS,
          types: ["outbuilding", "manor_estate"],
          regions: [],
          access: [],
          services: [],
        },
      }),
    ).toBe(
      listingScope({
        q: null,
        filters: {
          ...EMPTY_FILTERS,
          types: ["manor_estate", "outbuilding"],
          regions: [],
          access: [],
          services: [],
        },
      }),
    );
  });
});

describe("condition, ownership and family parameters (Day 18)", () => {
  it("reads the new parameters into stable identifiers, in canonical order", () => {
    const { filters, hadInvalidValues } = parseFilters(
      new URLSearchParams(
        "condition=unknown&condition=class_a&ownership=unknown&ownership=public&family=von Biron&family=Ābele&family_unknown=1",
      ),
    );

    expect(filters).toEqual({
      ...EMPTY_FILTERS,
      conditions: ["class_a", "unknown"],
      ownership: ["public", "unknown"],
      families: ["von Biron", "Ābele"],
      familyUnknown: true,
    });
    expect(hadInvalidValues).toBe(false);
  });

  it("accepts only the documented ownership groups, not the stored ownership values", () => {
    const { filters, hadInvalidValues } = parseFilters({
      ownership: ["private_person", "state", "private"],
    });
    expect(filters.ownership).toEqual(["private"]);
    expect(hadInvalidValues).toBe(true);
  });

  it("drops invented or obsolete condition values (e.g. ruined) and says so", () => {
    const { filters, hadInvalidValues } = parseFilters({ condition: ["ruined", "damaged"] });
    expect(filters.conditions).toEqual(["damaged"]);
    expect(hadInvalidValues).toBe(true);
  });

  it("accepts only family_unknown=1", () => {
    expect(parseFilters({ family_unknown: "1" }).filters.familyUnknown).toBe(true);
    const odd = parseFilters({ family_unknown: "true" });
    expect(odd.filters.familyUnknown).toBe(false);
    expect(odd.hadInvalidValues).toBe(true);
    expect(parseFilters({ family_unknown: "" }).hadInvalidValues).toBe(false);
  });

  it("trims, NFC-normalises and de-duplicates family names", () => {
    const decomposed = "A\u0304bele"; // "Ābele" with a combining macron
    const { filters } = parseFilters(
      new URLSearchParams([
        ["family", "  Ābele "],
        ["family", decomposed],
        ["family", "von Biron"],
      ]),
    );
    expect(filters.families).toEqual(["von Biron", "Ābele"]);
  });

  it(`bounds families: at most ${MAX_FAMILIES}, each at most ${MAX_FAMILY_LENGTH} characters`, () => {
    const tooMany = parseFilters(
      new URLSearchParams(Array.from({ length: 14 }, (_, i) => ["family", `Dzimta ${i + 10}`])),
    );
    expect(tooMany.filters.families).toHaveLength(MAX_FAMILIES);
    expect(tooMany.hadInvalidValues).toBe(true);

    const tooLong = parseFilters({ family: "x".repeat(MAX_FAMILY_LENGTH + 1) });
    expect(tooLong.filters.families).toEqual([]);
    expect(tooLong.hadInvalidValues).toBe(true);
  });

  it('counts every new selection, "unknown" choices included', () => {
    const filters = {
      ...EMPTY_FILTERS,
      conditions: ["unknown" as const],
      ownership: ["private" as const],
      families: ["von Biron"],
      familyUnknown: true,
    };
    expect(countActiveFilters(filters)).toBe(4);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, familyUnknown: true })).toBe(true);
  });

  it("round-trips a full listing through its URL", () => {
    const listing = {
      q: "muiža",
      filters: {
        ...EMPTY_FILTERS,
        types: ["manor_estate" as const],
        services: ["catering" as const],
        conditions: ["damaged" as const, "unknown" as const],
        ownership: ["private" as const],
        families: ["von Biron", "Ābele"],
        familyUnknown: true,
      },
    };
    const href = buildListingHref("/objects", listing);
    expect(href).toBe(
      "/objects?q=mui%C5%BEa&type=manor_estate&service=catering&condition=damaged&condition=unknown&ownership=private&family=von+Biron&family=%C4%80bele&family_unknown=1",
    );
    const parsed = parseListing(new URL(href, "http://localhost").searchParams);
    expect({ q: parsed.q, filters: parsed.filters }).toEqual(listing);
  });

  it("changes the cursor scope when any new filter changes, unknown choices included", () => {
    const base = { q: null, filters: { ...EMPTY_FILTERS, conditions: ["class_a" as const] } };
    const scopes = new Set([
      listingScope(base),
      listingScope({
        q: null,
        filters: { ...base.filters, conditions: ["class_a" as const, "unknown" as const] },
      }),
      listingScope({ q: null, filters: { ...base.filters, ownership: ["unknown" as const] } }),
      listingScope({ q: null, filters: { ...base.filters, families: ["von Biron"] } }),
      listingScope({ q: null, filters: { ...base.filters, familyUnknown: true } }),
    ]);
    expect(scopes.size).toBe(5);
  });

  it("leaves a Day 17-only listing's URL and cursor scope unchanged", () => {
    const listing = { q: null, filters: { ...EMPTY_FILTERS, types: ["manor_estate" as const] } };
    expect(buildListingHref("/objects", listing)).toBe("/objects?type=manor_estate");
  });
});
