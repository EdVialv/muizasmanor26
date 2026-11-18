/**
 * Map viewport rules (docs/DAY19_MAP_NOTES.md), shared by the browser and the
 * /api/directory/map route. Pure and dependency-free.
 *
 * - LATVIA_BOUNDS is where a published object's coordinates are valid map
 *   locations (docs/DATA_MODEL.md: "Do not publish coordinates outside
 *   Latvia"). It is Latvia's extent plus a small margin, and must stay
 *   identical to the box in supabase/migrations/20261116090000_directory_map.sql.
 * - A viewport is a longitude/latitude rectangle plus a zoom. It is
 *   validated, rounded (so equivalent requests share one cache key) and
 *   clamped to LATVIA_BOUNDS; one that cannot overlap Latvia is rejected.
 */

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface Viewport extends Bounds {
  zoom: number;
}

export const LATVIA_BOUNDS: Bounds = { west: 20.9, south: 55.6, east: 28.3, north: 58.15 };

/** Where the map opens: Latvia, fitted to the screen by the map itself. */
export const INITIAL_BOUNDS = LATVIA_BOUNDS;

export const MIN_ZOOM = 0;
export const MAX_ZOOM = 20;
export const DEFAULT_ZOOM = 7;

/** At most this many objects come back as points; more come back as clusters. */
export const MAX_MAP_OBJECTS = 500;

/** 5 decimal places = ~1 m: plenty for a viewport, and stable cache keys. */
const PRECISION = 1e5;

function round(value: number): number {
  return Math.round(value * PRECISION) / PRECISION;
}

/** True when a position is a valid map location (inside the Latvia box, edges included). */
export function isValidMapLocation(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= LATVIA_BOUNDS.south &&
    latitude <= LATVIA_BOUNDS.north &&
    longitude >= LATVIA_BOUNDS.west &&
    longitude <= LATVIA_BOUNDS.east
  );
}

/**
 * Validates a raw viewport and clamps it to Latvia. Null when it is not a
 * finite, correctly ordered rectangle inside ±90/±180, or does not overlap
 * Latvia at all. Rectangles crossing the antimeridian are not supported
 * (Latvia never needs them).
 */
export function normalizeViewport(raw: {
  west: number;
  south: number;
  east: number;
  north: number;
  zoom?: number;
}): Viewport | null {
  const { west, south, east, north } = raw;
  if (![west, south, east, north].every(Number.isFinite)) {
    return null;
  }
  if (west >= east || south >= north) {
    return null;
  }
  if (south < -90 || north > 90 || west < -180 || east > 180) {
    return null;
  }
  const clamped = {
    west: round(Math.max(west, LATVIA_BOUNDS.west)),
    south: round(Math.max(south, LATVIA_BOUNDS.south)),
    east: round(Math.min(east, LATVIA_BOUNDS.east)),
    north: round(Math.min(north, LATVIA_BOUNDS.north)),
  };
  if (clamped.west >= clamped.east || clamped.south >= clamped.north) {
    return null;
  }
  const zoom = Number.isFinite(raw.zoom)
    ? Math.min(Math.max(Math.round(raw.zoom as number), MIN_ZOOM), MAX_ZOOM)
    : DEFAULT_ZOOM;
  return { ...clamped, zoom };
}

/** `west,south,east,north` - the bbox query parameter. */
export function formatBbox(bounds: Bounds): string {
  return [bounds.west, bounds.south, bounds.east, bounds.north].map(round).join(",");
}

/**
 * Reads `bbox=west,south,east,north` and `zoom` from URL parameters.
 * Anything malformed - wrong count, non-numbers, repeated parameters -
 * gives null.
 */
export function parseViewportParams(params: URLSearchParams): Viewport | null {
  const bboxValues = params.getAll("bbox");
  const zoomValues = params.getAll("zoom");
  if (bboxValues.length !== 1 || zoomValues.length > 1) {
    return null;
  }
  const parts = bboxValues[0].split(",");
  if (parts.length !== 4 || parts.some((part) => !/^-?\d+(\.\d+)?$/.test(part.trim()))) {
    return null;
  }
  const [west, south, east, north] = parts.map(Number);
  let zoom: number | undefined;
  if (zoomValues.length === 1) {
    if (!/^\d{1,2}$/.test(zoomValues[0])) {
      return null;
    }
    zoom = Number(zoomValues[0]);
  }
  return normalizeViewport({ west, south, east, north, zoom });
}
