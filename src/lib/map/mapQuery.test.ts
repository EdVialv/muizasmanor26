import { describe, expect, it } from "vitest";
import { createRecordingSupabaseClient } from "@/test-support/recordingSupabaseClient";
import { EMPTY_FILTERS, parseListing } from "@/lib/directory/filters";
import { listingRpcArgs } from "@/lib/directory/supabaseSearchDataSource";
import { MAP_FUNCTION, fetchMapViewport, parseMapResponse, toMapResult } from "./mapQuery";

const VIEWPORT = { west: 24, south: 56.8, east: 24.4, north: 57.1, zoom: 11 };

const objectRow = (id: string, latitude: number, longitude: number) => ({
  kind: "object",
  id,
  slug: `s-${id}`,
  name_lv: `Nosaukums ${id}`,
  object_type: "manor_estate",
  latitude,
  longitude,
  object_count: 1,
  min_latitude: latitude,
  min_longitude: longitude,
  max_latitude: latitude,
  max_longitude: longitude,
});

describe("fetchMapViewport", () => {
  it("sends the viewport plus exactly the list's search and filter arguments", async () => {
    const { client, queries } = createRecordingSupabaseClient({ data: [], error: null });
    const listing = parseListing(
      new URLSearchParams(
        "q=muiža&type=manor_estate&region=Cēsu novads&access=open&service=catering&condition=unknown&ownership=public&family=Ābele&family_unknown=1",
      ),
    );

    await fetchMapViewport(client, VIEWPORT, listing);

    expect(queries[0].rpc).toEqual({
      name: MAP_FUNCTION,
      args: {
        west: 24,
        south: 56.8,
        east: 24.4,
        north: 57.1,
        zoom: 11,
        ...listingRpcArgs(listing.q, listing.filters),
      },
    });
    expect(listingRpcArgs(listing.q, listing.filters)).toMatchObject({
      search_query: "muiža",
      condition_categories: ["unknown"],
      historical_families: ["Ābele"],
      family_unknown: true,
    });
  });

  it("throws the underlying error", async () => {
    const { client } = createRecordingSupabaseClient({ data: null, error: new Error("boom") });
    await expect(
      fetchMapViewport(client, VIEWPORT, { q: null, filters: EMPTY_FILTERS }),
    ).rejects.toThrow("boom");
  });
});

describe("toMapResult", () => {
  it("returns every point with its exact total when there are no clusters", () => {
    const result = toMapResult([objectRow("a", 56.9, 24.1), objectRow("b", 56.9, 24.1)]);
    expect(result.mode).toBe("objects");
    expect(result.total).toBe(2);
    expect(result.objects.map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("counts cluster members exactly and marks the result as clustered", () => {
    const result = toMapResult([
      {
        ...objectRow("x", 56.95, 24.2),
        kind: "cluster",
        id: null,
        slug: null,
        name_lv: null,
        object_type: null,
        object_count: 612,
        min_latitude: 56.8,
        min_longitude: 24.0,
        max_latitude: 57.1,
        max_longitude: 24.4,
      },
      objectRow("single", 56.85, 24.05),
    ]);
    expect(result.mode).toBe("clusters");
    expect(result.total).toBe(613);
    expect(result.clusters[0]).toEqual({
      latitude: 56.95,
      longitude: 24.2,
      count: 612,
      bounds: { south: 56.8, west: 24.0, north: 57.1, east: 24.4 },
    });
  });

  it("drops rows outside the valid map area or malformed - never repairs them", () => {
    const result = toMapResult([
      objectRow("ok", 56.9, 24.1),
      objectRow("gdansk", 54.352, 18.6466),
      objectRow("zero", 0, 0),
      { ...objectRow("nan", 56.9, 24.1), latitude: "abc" },
      { ...objectRow("noslug", 56.9, 24.1), slug: "" },
      { ...objectRow("weird", 56.9, 24.1), kind: "other" },
    ]);
    expect(result.objects.map((o) => o.id)).toEqual(["ok"]);
    expect(result.total).toBe(1);
  });
});

describe("parseMapResponse", () => {
  it("accepts the route's JSON and rejects anything else", () => {
    const body = {
      mode: "objects",
      objects: [
        {
          id: "a",
          slug: "s-a",
          name: "A",
          objectType: "manor_estate",
          latitude: 56.9,
          longitude: 24.1,
        },
      ],
      clusters: [],
      total: 1,
    };
    expect(parseMapResponse(body)?.objects).toHaveLength(1);
    expect(parseMapResponse({ error: "unavailable" })).toBeNull();
    expect(parseMapResponse({ ...body, mode: "x" })).toBeNull();
    expect(parseMapResponse(null)).toBeNull();
  });
});
