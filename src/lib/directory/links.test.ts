import { describe, expect, it } from "vitest";
import { encodeCursor } from "./cursor";
import { buildDirectoryHref, buildObjectHref, parseDirectoryContext } from "./links";
import { EMPTY_FILTERS } from "./filters";
import { searchScope } from "./searchQuery";

const TOKEN = encodeCursor({
  name: "Rundāles pils (ziemeļu spārns)",
  id: "11111111-2222-4333-8444-555555555555",
});

describe("parseDirectoryContext", () => {
  it("keeps a well-formed cursor token", () => {
    expect(parseDirectoryContext(TOKEN)).toEqual({ cursor: TOKEN });
  });

  it("drops a missing, repeated or malformed value", () => {
    expect(parseDirectoryContext(undefined)).toEqual({});
    expect(parseDirectoryContext([TOKEN, TOKEN])).toEqual({});
    expect(parseDirectoryContext("not-a-cursor")).toEqual({});
    expect(parseDirectoryContext("https://evil.example/")).toEqual({});
  });
});

describe("buildDirectoryHref", () => {
  it("points at the first page without context", () => {
    expect(buildDirectoryHref()).toBe("/objects");
    expect(buildDirectoryHref({})).toBe("/objects");
  });

  it("restores the directory page the visitor came from", () => {
    expect(buildDirectoryHref({ cursor: TOKEN })).toBe(`/objects?cursor=${TOKEN}`);
  });
});

describe("buildObjectHref", () => {
  it("links to the object by slug", () => {
    expect(buildObjectHref("rundales-pils")).toBe("/objects/rundales-pils");
  });

  it("carries the directory context as a single `from` token", () => {
    expect(buildObjectHref("rundales-pils", { cursor: TOKEN })).toBe(
      `/objects/rundales-pils?from=${TOKEN}`,
    );
  });

  it("round-trips: an object link's `from` parses back to the same context", () => {
    const href = buildObjectHref("rundales-pils", { cursor: TOKEN });
    const from = new URL(href, "http://localhost").searchParams.get("from") ?? undefined;
    expect(parseDirectoryContext(from)).toEqual({ cursor: TOKEN });
  });
});

describe("search context (Day 16)", () => {
  const SEARCH_TOKEN = encodeCursor({
    name: "Rundāles pils",
    id: "11111111-2222-4333-8444-555555555555",
    scope: searchScope("pils"),
  });

  it("keeps a search query and its own cursor", () => {
    expect(parseDirectoryContext(SEARCH_TOKEN, "pils")).toEqual({
      q: "pils",
      cursor: SEARCH_TOKEN,
    });
  });

  it("normalises the query and drops a blank one", () => {
    expect(parseDirectoryContext(undefined, "  pils  ")).toEqual({ q: "pils" });
    expect(parseDirectoryContext(undefined, "   ")).toEqual({});
  });

  it("drops a cursor that belongs to a different search or to no search, keeping the query", () => {
    expect(parseDirectoryContext(SEARCH_TOKEN, "muiža")).toEqual({ q: "muiža" });
    expect(parseDirectoryContext(TOKEN, "pils")).toEqual({ q: "pils" });
    expect(parseDirectoryContext(SEARCH_TOKEN, undefined)).toEqual({});
  });

  it("builds links that return to the same search and page", () => {
    expect(buildDirectoryHref({ q: "Rundāles pils" })).toBe("/objects?q=Rund%C4%81les+pils");
    expect(buildDirectoryHref({ q: "pils", cursor: SEARCH_TOKEN })).toBe(
      `/objects?q=pils&cursor=${SEARCH_TOKEN}`,
    );
    expect(buildObjectHref("rundales-pils", { q: "pils", cursor: SEARCH_TOKEN })).toBe(
      `/objects/rundales-pils?fromQ=pils&from=${SEARCH_TOKEN}`,
    );
  });

  it("round-trips: an object link from a search parses back to the same search context", () => {
    const href = buildObjectHref("rundales-pils", { q: "pils", cursor: SEARCH_TOKEN });
    const url = new URL(href, "http://localhost");
    expect(
      parseDirectoryContext(
        url.searchParams.get("from") ?? undefined,
        url.searchParams.get("fromQ") ?? undefined,
      ),
    ).toEqual({ q: "pils", cursor: SEARCH_TOKEN });
  });
});

describe("filter context (Day 17)", () => {
  const filters = {
    ...EMPTY_FILTERS,
    types: ["palace_or_castle" as const],
    regions: ["Cēsu novads"],
    access: [],
    services: ["catering" as const],
  };

  it("carries filters to the object page and back", async () => {
    const { listingScope } = await import("./filters");
    const token = encodeCursor({
      name: "Cēsu pils",
      id: "11111111-2222-4333-8444-555555555555",
      scope: listingScope({ q: "pils", filters }),
    });
    const href = buildObjectHref("cesu-pils", { q: "pils", filters, cursor: token });
    const url = new URL(href, "http://localhost");

    const context = parseDirectoryContext(
      url.searchParams.get("from") ?? undefined,
      url.searchParams.get("fromQ") ?? undefined,
      url.searchParams.get("fromFilters") ?? undefined,
    );

    expect(context).toEqual({ q: "pils", filters, cursor: token });
    expect(buildDirectoryHref(context)).toBe(
      `/objects?q=pils&type=palace_or_castle&region=C%C4%93su+novads&service=catering&cursor=${token}`,
    );
  });

  it("drops a cursor that belongs to different filters, keeping the listing itself", () => {
    const context = parseDirectoryContext(TOKEN, undefined, "type=palace_or_castle");
    expect(context).toEqual({
      filters: {
        ...EMPTY_FILTERS,
        types: ["palace_or_castle"],
        regions: [],
        access: [],
        services: [],
      },
    });
  });

  it("drops unknown filter values from a tampered link", () => {
    expect(parseDirectoryContext(undefined, undefined, "type=castle&service=spa")).toEqual({});
  });
});

describe("map context (Day 19)", () => {
  it("round-trips search, filters, list page, map view and position through an object link (Day 20)", async () => {
    const { buildObjectHref, parseDirectoryContextParams, buildDirectoryHref, directoryBackLabel } =
      await import("./links");
    const { listingScope } = await import("./filters");
    const filters = { ...EMPTY_FILTERS, types: ["palace_or_castle" as const], familyUnknown: true };
    const cursor = encodeCursor({
      name: "Jaunmoku pils",
      id: "11111111-2222-4333-8444-555555555555",
      scope: listingScope({ q: "pils", filters }),
    });
    const href = buildObjectHref("rundales-pils", {
      q: "pils",
      filters,
      view: "map",
      cursor,
      position: { lat: 56.6142, lng: 24.1937, zoom: 12 },
    });
    const url = new URL(href, "http://localhost");
    expect(url.searchParams.get("fromView")).toBe("map");
    expect(url.searchParams.get("from")).toBe(cursor);
    expect(url.searchParams.get("fromLat")).toBe("56.6142");
    expect(url.searchParams.get("fromLng")).toBe("24.1937");
    expect(url.searchParams.get("fromZoom")).toBe("12");

    const context = parseDirectoryContextParams(Object.fromEntries(url.searchParams));
    expect(context.view).toBe("map");
    expect(context.cursor).toBe(cursor);
    expect(buildDirectoryHref(context)).toBe(
      `/map?q=pils&type=palace_or_castle&family_unknown=1&cursor=${cursor}&lat=56.6142&lng=24.1937&zoom=12`,
    );
    expect(directoryBackLabel(context)).toBe("Atpakaļ uz karti");

    // From the list, the position travels too, so "back" and then "Karte"
    // restores the map.
    const fromList = parseDirectoryContextParams(
      Object.fromEntries(
        new URL(
          buildObjectHref("rundales-pils", {
            q: "pils",
            filters,
            cursor,
            position: { lat: 56.6142, lng: 24.1937, zoom: 12 },
          }),
          "http://localhost",
        ).searchParams,
      ),
    );
    expect(buildDirectoryHref(fromList)).toBe(
      `/objects?q=pils&type=palace_or_castle&family_unknown=1&cursor=${cursor}&lat=56.6142&lng=24.1937&zoom=12`,
    );
  });

  it("drops a map cursor from another listing and an invalid position, keeping the rest", async () => {
    const { parseDirectoryContextParams, buildDirectoryHref } = await import("./links");
    const context = parseDirectoryContextParams({
      fromQ: "pils",
      fromView: "map",
      from: TOKEN, // scoped to the plain directory, not to "pils"
      fromLat: "99",
      fromLng: "24.1",
      fromZoom: "12",
    });
    expect(context).toEqual({ q: "pils", view: "map" });
    expect(buildDirectoryHref(context)).toBe("/map?q=pils");
    expect(
      parseDirectoryContextParams({ fromLat: ["56.9", "56.8"], fromLng: "24.1", fromZoom: "9" }),
    ).toEqual({});
  });

  it("ignores an unknown fromView and keeps the list behaviour", async () => {
    const { parseDirectoryContext, buildDirectoryHref, directoryBackLabel } =
      await import("./links");
    const context = parseDirectoryContext(undefined, "pils", undefined, "satellite");
    expect(context.view).toBeUndefined();
    expect(buildDirectoryHref(context)).toBe("/objects?q=pils");
    expect(directoryBackLabel(context)).toBe("Atpakaļ uz katalogu");
  });
});
