import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
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
        { types: ["palace_or_castle", "manor_estate"], regions: [], access: [], services: [] },
        { types: ["manor_estate", "palace_or_castle"], regions: [], access: [], services: [] },
      ),
    ).toBe(true);
  });
});

describe("listings, URLs and cursor scope", () => {
  const filters = canonicalFilters({
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
        filters: { types: ["outbuilding", "manor_estate"], regions: [], access: [], services: [] },
      }),
    ).toBe(
      listingScope({
        q: null,
        filters: { types: ["manor_estate", "outbuilding"], regions: [], access: [], services: [] },
      }),
    );
  });
});
