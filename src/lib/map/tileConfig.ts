/**
 * Base-map tile configuration (docs/DAY19_MAP_NOTES.md, "Tiles").
 *
 * Read on the server from environment variables and passed to the map as
 * props - nothing is inlined at build time, and no key is committed:
 *
 *   MAP_TILE_URL          https XYZ template with {z}, {x} and {y}
 *                         (and optionally {s}, {r}); may contain a
 *                         provider key, which the browser will see - use a
 *                         key restricted to the site's domain
 *   MAP_TILE_ATTRIBUTION  required with MAP_TILE_URL; plain text shown in
 *                         the map's attribution control
 *   MAP_TILE_MAX_ZOOM     optional, 1-22 (default 19)
 *
 * Without MAP_TILE_URL:
 * - outside production, the OpenStreetMap Foundation's standard tile
 *   server is used, under its Tile Usage Policy (attribution, no bulk or
 *   offline download, best effort and no SLA);
 * - in production there is no base map: the objects still show, with a
 *   notice, until a tile provider is chosen and configured. The community
 *   OSM tile server is not a production back end (docs/ARCHITECTURE.md).
 */

export interface TileConfig {
  urlTemplate: string;
  attribution: string;
  maxZoom: number;
}

export const OSM_STANDARD_TILES: TileConfig = {
  urlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: "© OpenStreetMap contributors",
  maxZoom: 19,
};

export type TileConfigOutcome =
  | { kind: "configured"; config: TileConfig }
  | { kind: "development_default"; config: TileConfig }
  | { kind: "missing" }
  | { kind: "invalid" };

type Env = Record<string, string | undefined>;

export function isValidTileTemplate(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value.replace(/\{[a-z]\}/g, "0"));
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    value.includes("{z}") &&
    value.includes("{x}") &&
    value.includes("{y}")
  );
}

export function readTileConfig(env: Env = process.env): TileConfigOutcome {
  const urlTemplate = env.MAP_TILE_URL?.trim();
  if (!urlTemplate) {
    return env.NODE_ENV === "production"
      ? { kind: "missing" }
      : { kind: "development_default", config: OSM_STANDARD_TILES };
  }
  const attribution = env.MAP_TILE_ATTRIBUTION?.trim();
  if (!isValidTileTemplate(urlTemplate) || !attribution) {
    return { kind: "invalid" };
  }
  const rawMaxZoom = env.MAP_TILE_MAX_ZOOM?.trim();
  const maxZoom = rawMaxZoom ? Number(rawMaxZoom) : 19;
  if (!Number.isInteger(maxZoom) || maxZoom < 1 || maxZoom > 22) {
    return { kind: "invalid" };
  }
  return { kind: "configured", config: { urlTemplate, attribution, maxZoom } };
}
