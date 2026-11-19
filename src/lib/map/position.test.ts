import { describe, expect, it } from "vitest";
import {
  MAX_POSITION_ZOOM,
  MIN_POSITION_ZOOM,
  normalizePosition,
  parsePosition,
  positionEntries,
  positionsEqual,
} from "./position";

describe("map position in the URL (Day 20)", () => {
  it("parses a valid lat/lng/zoom and rounds to 5 decimal places", () => {
    expect(parsePosition(new URLSearchParams("lat=56.61423456&lng=24.193712&zoom=12"))).toEqual({
      position: { lat: 56.61423, lng: 24.19371, zoom: 12 },
      hadInvalidPosition: false,
    });
  });

  it("reads Next.js page props as well as URLSearchParams", () => {
    expect(parsePosition({ lat: "57", lng: "25.5", zoom: "8" }).position).toEqual({
      lat: 57,
      lng: 25.5,
      zoom: 8,
    });
  });

  it("is absent (the default view) when no parameter is given", () => {
    expect(parsePosition(new URLSearchParams(""))).toEqual({
      position: null,
      hadInvalidPosition: false,
    });
  });

  it.each([
    ["partial", "lat=56.9&lng=24.1"],
    ["repeated", "lat=56.9&lat=57&lng=24.1&zoom=9"],
    ["not a number", "lat=abc&lng=24.1&zoom=9"],
    ["exponent", "lat=5.69e1&lng=24.1&zoom=9"],
    ["hex", "lat=0x38&lng=24.1&zoom=9"],
    ["fractional zoom", "lat=56.9&lng=24.1&zoom=9.5"],
    ["zoom below the map's minimum", `lat=56.9&lng=24.1&zoom=${MIN_POSITION_ZOOM - 1}`],
    ["zoom above the maximum", `lat=56.9&lng=24.1&zoom=${MAX_POSITION_ZOOM + 1}`],
    ["oversized zoom", "lat=56.9&lng=24.1&zoom=100000"],
    ["centre far outside Latvia", "lat=48.85&lng=2.35&zoom=9"],
    ["invalid latitude", "lat=91&lng=24.1&zoom=9"],
    ["oversized value", `lat=56.${"9".repeat(40)}&lng=24.1&zoom=9`],
    ["empty values", "lat=&lng=&zoom="],
  ])("drops a %s position and says so", (_label, query) => {
    expect(parsePosition(new URLSearchParams(query))).toEqual({
      position: null,
      hadInvalidPosition: true,
    });
  });

  it("allows a centre just outside the Latvia box, to pan around the border", () => {
    expect(normalizePosition({ lat: 55.2, lng: 21.0, zoom: 10 })).toEqual({
      lat: 55.2,
      lng: 21,
      zoom: 10,
    });
  });

  it("accepts the complete zoom range supported by configured tile providers", () => {
    expect(parsePosition(new URLSearchParams("lat=56.9&lng=24.1&zoom=1")).position?.zoom).toBe(1);
    expect(parsePosition(new URLSearchParams("lat=56.9&lng=24.1&zoom=22")).position?.zoom).toBe(22);
  });

  it("serialises a position canonically, and the default as nothing", () => {
    expect(positionEntries({ lat: 56.614234567, lng: 24.1, zoom: 12 })).toEqual([
      ["lat", "56.61423"],
      ["lng", "24.1"],
      ["zoom", "12"],
    ]);
    expect(positionEntries(null)).toEqual([]);
  });

  it("round-trips: parse(serialise(p)) === p", () => {
    const position = { lat: 57.31234, lng: 25.27001, zoom: 15 };
    const params = new URLSearchParams(positionEntries(position));
    expect(parsePosition(params).position).toEqual(position);
  });

  it("compares positions at URL precision", () => {
    expect(
      positionsEqual({ lat: 56.9, lng: 24.1, zoom: 9 }, { lat: 56.900001, lng: 24.1, zoom: 9 }),
    ).toBe(true);
    expect(
      positionsEqual({ lat: 56.9, lng: 24.1, zoom: 9 }, { lat: 56.9, lng: 24.1, zoom: 10 }),
    ).toBe(false);
    expect(positionsEqual(null, null)).toBe(true);
    expect(positionsEqual(null, { lat: 56.9, lng: 24.1, zoom: 9 })).toBe(false);
  });
});
