import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { fetchMapViewport } = vi.hoisted(() => ({ fetchMapViewport: vi.fn() }));
vi.mock("@/lib/map/mapQuery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/map/mapQuery")>()),
  fetchMapViewport,
}));

import { parseListing } from "@/lib/directory/filters";
import { GET } from "./route";

const request = (query: string) => new NextRequest(`http://localhost/api/directory/map?${query}`);

function configure() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
}

describe("GET /api/directory/map", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    fetchMapViewport.mockReset();
  });

  it("answers 400 for an invalid viewport without querying", async () => {
    configure();
    for (const query of ["", "bbox=1,2,3&zoom=7", "bbox=25,56,24,57", "bbox=10,50,15,52"]) {
      const response = await GET(request(query));
      expect(response.status).toBe(400);
    }
    expect(fetchMapViewport).not.toHaveBeenCalled();
  });

  it("parses search and filters exactly as the list does, ignoring cursor, and clamps to Latvia", async () => {
    configure();
    fetchMapViewport.mockResolvedValue({ mode: "objects", objects: [], clusters: [], total: 0 });
    const query =
      "q=muiža&type=castle&type=manor_estate&condition=unknown&family=  Ābele &family_unknown=1&cursor=abc";

    const response = await GET(request(`bbox=-10,40,40,70&zoom=7&${query}`));

    expect(response.status).toBe(200);
    const [, viewport, listing] = fetchMapViewport.mock.calls[0];
    expect(viewport).toEqual({ west: 20.9, south: 55.6, east: 28.3, north: 58.15, zoom: 7 });
    const expected = parseListing(new URLSearchParams(query));
    expect(listing).toEqual({ q: expected.q, filters: expected.filters });
    expect(listing.filters.types).toEqual(["manor_estate"]);
    expect(listing.filters.families).toEqual(["Ābele"]);
    expect(response.headers.get("cache-control")).toMatch(/max-age=30/);
  });

  it("answers 503 / 502 with a generic body on configuration or query failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect((await GET(request("bbox=24,56,25,57&zoom=9"))).status).toBe(503);

    configure();
    fetchMapViewport.mockRejectedValue(new Error("function public_map_objects does not exist"));
    const response = await GET(request("bbox=24,56,25,57&zoom=9"));
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toMatch(/public_map_objects/);
    consoleError.mockRestore();
  });
});
