import { describe, expect, it } from "vitest";
import { encodeCursor } from "./cursor";
import { buildDirectoryHref, buildObjectHref, parseDirectoryContext } from "./links";

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
