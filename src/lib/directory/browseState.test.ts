import { afterEach, describe, expect, it, vi } from "vitest";
import {
  browseKey,
  browseStatesEqual,
  buildBrowseHref,
  parseBrowseState,
  routeKey,
  validCursorFor,
  type BrowseState,
} from "./browseState";
import { decodeCursor, encodeCursor } from "./cursor";
import { EMPTY_FILTERS, MAX_FAMILIES, listingScope, type DirectoryListing } from "./filters";

const ID = "11111111-2222-4333-8444-555555555555";

function cursorFor(listing: DirectoryListing, name = "Jaunmoku pils"): string {
  return encodeCursor({ name, id: ID, scope: listingScope(listing) });
}

const FULL_LISTING: DirectoryListing = {
  q: "pils",
  filters: {
    types: ["manor_estate", "palace_or_castle"],
    regions: ["Bauskas novads", "Cēsu novads"],
    access: ["open"],
    services: ["accommodation", "events"],
    conditions: ["class_a", "unknown"],
    ownership: ["public", "unknown"],
    families: ["Lībieri", "fon der Pālen"], // code-point order
    familyUnknown: true,
  },
};

describe("parseBrowseState / buildBrowseHref (Day 20)", () => {
  it("round-trips every supported parameter, including unknown filter values", () => {
    const state: BrowseState = {
      listing: FULL_LISTING,
      cursor: cursorFor(FULL_LISTING),
      position: { lat: 56.6142, lng: 24.1937, zoom: 12 },
    };
    const href = buildBrowseHref("/map", state);
    const url = new URL(href, "http://localhost");
    expect([...new Set(url.searchParams.keys())]).toEqual([
      "q",
      "type",
      "region",
      "access",
      "service",
      "condition",
      "ownership",
      "family",
      "family_unknown",
      "cursor",
      "lat",
      "lng",
      "zoom",
    ]);
    const parsed = parseBrowseState(url.searchParams);
    expect(parsed.state).toEqual(state);
    expect(parsed.hadInvalidValues || parsed.hadInvalidCursor || parsed.hadInvalidPosition).toBe(
      false,
    );
    // Canonical: serialising the parsed state gives the same URL.
    expect(buildBrowseHref("/map", parsed.state)).toBe(href);
  });

  it("omits defaults: the plain directory has no query at all", () => {
    const state = parseBrowseState(new URLSearchParams("")).state;
    expect(state).toEqual({
      listing: { q: null, filters: EMPTY_FILTERS },
      cursor: null,
      position: null,
    });
    expect(buildBrowseHref("/objects", state)).toBe("/objects");
    expect(buildBrowseHref("/map", state)).toBe("/map");
  });

  it("canonicalises order, duplicates and whitespace, and is idempotent", () => {
    const messy = new URLSearchParams(
      "zoom=9&lng=24.10000&lat=56.90&service=events&service=accommodation&service=events" +
        "&type=palace_or_castle&type=manor_estate&q=%20%20pils%20&condition=unknown&condition=class_a",
    );
    const once = buildBrowseHref("/objects", parseBrowseState(messy).state);
    expect(once).toBe(
      "/objects?q=pils&type=manor_estate&type=palace_or_castle&service=accommodation&service=events" +
        "&condition=class_a&condition=unknown&lat=56.9&lng=24.1&zoom=9",
    );
    const twice = buildBrowseHref(
      "/objects",
      parseBrowseState(new URL(once, "http://localhost").searchParams).state,
    );
    expect(twice).toBe(once);
  });

  it("drops unsupported filter values and notes it, keeping the rest", () => {
    const parsed = parseBrowseState(
      new URLSearchParams("type=spaceship&type=manor_house&ownership=state&utm_source=x"),
    );
    expect(parsed.hadInvalidValues).toBe(true);
    expect(buildBrowseHref("/objects", parsed.state)).toBe("/objects?type=manor_house");
  });

  it("bounds oversized and repeated values", () => {
    const families = Array.from({ length: MAX_FAMILIES + 5 }, (_, i) => `family=Dzimta${i}`);
    const parsed = parseBrowseState(
      new URLSearchParams(`q=${"a".repeat(5000)}&q=b&${families.join("&")}`),
    );
    expect(parsed.state.listing.q).toBeNull(); // repeated q is not a query
    expect(parsed.state.listing.filters.families.length).toBeLessThanOrEqual(MAX_FAMILIES);
  });

  it("keeps a cursor only for its own listing, once", () => {
    const listing: DirectoryListing = { q: "pils", filters: EMPTY_FILTERS };
    const cursor = cursorFor(listing);
    const ok = parseBrowseState(new URLSearchParams({ q: "pils", cursor }));
    expect(ok.state.cursor).toBe(cursor);
    expect(ok.hadInvalidCursor).toBe(false);

    // The same cursor with a different search, or with a filter added: page 1.
    for (const query of [
      `q=muiza&cursor=${cursor}`,
      `q=pils&type=manor_house&cursor=${cursor}`,
      `cursor=${cursor}`,
      `q=pils&cursor=${cursor}&cursor=${cursor}`,
      "q=pils&cursor=not-a-cursor",
      `q=pils&cursor=${"A".repeat(3000)}`,
    ]) {
      const parsed = parseBrowseState(new URLSearchParams(query));
      expect(parsed.state.cursor, query).toBeNull();
      expect(parsed.hadInvalidCursor, query).toBe(true);
      expect(
        new URL(buildBrowseHref("/objects", parsed.state), "http://x").searchParams.has("cursor"),
      ).toBe(false);
    }
    expect(validCursorFor(listing, null)).toBeNull();
  });

  it("keeps the map position and the cursor independent", () => {
    const listing: DirectoryListing = {
      q: null,
      filters: { ...EMPTY_FILTERS, types: ["manor_house"] },
    };
    const cursor = cursorFor(listing);
    const parsed = parseBrowseState(
      new URLSearchParams(`type=manor_house&cursor=${cursor}&lat=99&lng=24&zoom=8`),
    );
    expect(parsed.state.cursor).toBe(cursor);
    expect(parsed.state.position).toBeNull();
    expect(parsed.hadInvalidPosition).toBe(true);
  });

  it("separates what the server renders (route) from the map position", () => {
    const a = parseBrowseState(new URLSearchParams("q=pils&lat=56.9&lng=24.1&zoom=9")).state;
    const b = parseBrowseState(new URLSearchParams("q=pils&lat=57&lng=25&zoom=10")).state;
    expect(routeKey(a)).toBe(routeKey(b));
    expect(browseKey(a)).not.toBe(browseKey(b));
    expect(browseStatesEqual(a, b)).toBe(false);
    expect(browseStatesEqual(a, { ...b, position: a.position })).toBe(true);
  });

  it("stays bounded however long the visitor browses", () => {
    // Repeated view switches, page turns and map moves: each state replaces
    // the previous one, nothing accumulates.
    let state: BrowseState = { listing: FULL_LISTING, cursor: null, position: null };
    let longest = 0;
    for (let page = 0; page < 200; page += 1) {
      state = {
        ...state,
        cursor: cursorFor(state.listing, `Objekts ${page} ${"ā".repeat(page % 50)}`),
        position: { lat: 56 + (page % 20) / 10, lng: 22 + (page % 50) / 10, zoom: 6 + (page % 13) },
      };
      for (const view of ["/objects", "/map"]) {
        const href = buildBrowseHref(view, state);
        longest = Math.max(longest, href.length);
        state = parseBrowseState(new URL(href, "http://localhost").searchParams).state;
      }
    }
    expect(state.cursor).not.toBeNull();
    expect(longest).toBeLessThan(2_000);
  });
});

describe("decodeCursor in the browser (no Buffer)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("decodes the same tokens with atob/TextDecoder, including non-ASCII names", () => {
    const listing: DirectoryListing = { q: "pils", filters: EMPTY_FILTERS };
    const token = cursorFor(listing, "Ēdoles pils «Ziemeļu spārns»");
    vi.stubGlobal("Buffer", undefined);
    expect(decodeCursor(token)).toEqual({
      name: "Ēdoles pils «Ziemeļu spārns»",
      id: ID,
      scope: listingScope(listing),
    });
    expect(decodeCursor("%%%")).toBeNull();
    expect(decodeCursor(btoa("\xff\xfe").replace(/=+$/, ""))).toBeNull();
  });
});
