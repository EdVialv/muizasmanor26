import { describe, expect, it } from "vitest";
import {
  DEFAULT_ZOOM,
  LATVIA_BOUNDS,
  formatBbox,
  isValidMapLocation,
  normalizeViewport,
  parseViewportParams,
} from "./viewport";

const params = (query: string) => new URLSearchParams(query);

describe("isValidMapLocation", () => {
  it("accepts Latvia, edges included, and rejects everything else", () => {
    expect(isValidMapLocation(56.95, 24.1)).toBe(true);
    expect(isValidMapLocation(LATVIA_BOUNDS.south, LATVIA_BOUNDS.west)).toBe(true);
    expect(isValidMapLocation(LATVIA_BOUNDS.north, LATVIA_BOUNDS.east)).toBe(true);
    expect(isValidMapLocation(54.352, 18.6466)).toBe(false); // Gdańsk
    expect(isValidMapLocation(0, 0)).toBe(false);
    expect(isValidMapLocation(Number.NaN, 24)).toBe(false);
    expect(isValidMapLocation(57, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("normalizeViewport", () => {
  it("keeps a valid rectangle inside Latvia, rounded to 5 decimals", () => {
    expect(
      normalizeViewport({ west: 24.0000049, south: 56.8, east: 24.4, north: 57.1, zoom: 11.4 }),
    ).toEqual({ west: 24, south: 56.8, east: 24.4, north: 57.1, zoom: 11 });
  });

  it("clamps a larger rectangle to the Latvia box", () => {
    expect(normalizeViewport({ west: -180, south: -90, east: 180, north: 90, zoom: 3 })).toEqual({
      ...LATVIA_BOUNDS,
      zoom: 3,
    });
  });

  it("rejects rectangles that are not finite, are reversed or empty, or leave the globe", () => {
    for (const bad of [
      { west: Number.NaN, south: 56, east: 25, north: 57 },
      { west: 24, south: 56, east: Number.POSITIVE_INFINITY, north: 57 },
      { west: 25, south: 56, east: 24, north: 57 },
      { west: 24, south: 57, east: 25, north: 56 },
      { west: 24, south: 57, east: 24, north: 58 },
      { west: -200, south: 56, east: 25, north: 57 },
      { west: 24, south: 56, east: 25, north: 95 },
    ]) {
      expect(normalizeViewport(bad)).toBeNull();
    }
  });

  it("rejects a valid rectangle that does not overlap Latvia", () => {
    expect(normalizeViewport({ west: 10, south: 50, east: 15, north: 52 })).toBeNull();
  });

  it("clamps the zoom and defaults it", () => {
    expect(normalizeViewport({ west: 24, south: 56, east: 25, north: 57, zoom: 99 })?.zoom).toBe(
      20,
    );
    expect(normalizeViewport({ west: 24, south: 56, east: 25, north: 57, zoom: -3 })?.zoom).toBe(0);
    expect(normalizeViewport({ west: 24, south: 56, east: 25, north: 57 })?.zoom).toBe(
      DEFAULT_ZOOM,
    );
  });
});

describe("parseViewportParams", () => {
  it("reads bbox=west,south,east,north and zoom", () => {
    expect(parseViewportParams(params("bbox=24,56.8,24.4,57.1&zoom=11"))).toEqual({
      west: 24,
      south: 56.8,
      east: 24.4,
      north: 57.1,
      zoom: 11,
    });
    expect(formatBbox({ west: 24, south: 56.8, east: 24.4, north: 57.1 })).toBe(
      "24,56.8,24.4,57.1",
    );
  });

  it("rejects malformed, repeated or non-numeric parameters", () => {
    for (const query of [
      "",
      "zoom=7",
      "bbox=24,56,25",
      "bbox=24,56,25,57,58",
      "bbox=a,56,25,57",
      "bbox=1e1,56,25,57",
      "bbox=24,56,25,57&bbox=24,56,25,57",
      "bbox=24,56,25,57&zoom=7.5",
      "bbox=24,56,25,57&zoom=-1",
      "bbox=24,56,25,57&zoom=7&zoom=8",
      "bbox=Infinity,56,25,57",
    ]) {
      expect(parseViewportParams(params(query))).toBeNull();
    }
  });
});
