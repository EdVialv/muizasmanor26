import { describe, expect, it } from "vitest";
import { OSM_STANDARD_TILES, isValidTileTemplate, readTileConfig } from "./tileConfig";

describe("readTileConfig", () => {
  it("uses the configured https template, attribution and max zoom", () => {
    expect(
      readTileConfig({
        NODE_ENV: "production",
        MAP_TILE_URL: "https://tiles.example.com/styles/a/{z}/{x}/{y}{r}.png?api_key=public",
        MAP_TILE_ATTRIBUTION: "© Example © OpenStreetMap",
        MAP_TILE_MAX_ZOOM: "20",
      }),
    ).toEqual({
      kind: "configured",
      config: {
        urlTemplate: "https://tiles.example.com/styles/a/{z}/{x}/{y}{r}.png?api_key=public",
        attribution: "© Example © OpenStreetMap",
        maxZoom: 20,
      },
    });
  });

  it("falls back to the OSM standard tiles outside production only", () => {
    expect(readTileConfig({ NODE_ENV: "development" })).toEqual({
      kind: "development_default",
      config: OSM_STANDARD_TILES,
    });
    expect(OSM_STANDARD_TILES.attribution).toMatch(/OpenStreetMap contributors/);
    expect(readTileConfig({ NODE_ENV: "production" })).toEqual({ kind: "missing" });
  });

  it("refuses insecure or incomplete templates, a missing attribution and bad zooms", () => {
    const base = { NODE_ENV: "production", MAP_TILE_ATTRIBUTION: "© X" };
    for (const env of [
      { ...base, MAP_TILE_URL: "http://tiles.example.com/{z}/{x}/{y}.png" },
      { ...base, MAP_TILE_URL: "https://tiles.example.com/{z}/{x}.png" },
      { ...base, MAP_TILE_URL: "not a url {z}{x}{y}" },
      { NODE_ENV: "production", MAP_TILE_URL: "https://tiles.example.com/{z}/{x}/{y}.png" },
      {
        ...base,
        MAP_TILE_URL: "https://tiles.example.com/{z}/{x}/{y}.png",
        MAP_TILE_MAX_ZOOM: "30",
      },
      {
        ...base,
        MAP_TILE_URL: "https://tiles.example.com/{z}/{x}/{y}.png",
        MAP_TILE_MAX_ZOOM: "x",
      },
    ]) {
      expect(readTileConfig(env).kind).toBe("invalid");
    }
    expect(isValidTileTemplate("https://{s}.tile.example.com/{z}/{x}/{y}.png")).toBe(true);
  });
});
