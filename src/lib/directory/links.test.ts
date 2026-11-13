import { describe, expect, it } from "vitest";
import { encodeCursor } from "./cursor";
import { buildDirectoryHref, buildObjectHref, parseDirectoryContext } from "./links";
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
