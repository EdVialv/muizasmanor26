/**
 * The map position in the URL (Day 20 - docs/DAY20_URL_STATE_NOTES.md):
 * `lat`, `lng` and `zoom`. Pure and dependency-free.
 *
 * Centre and zoom are authoritative, not bounds: the same link shows the
 * same place at the same scale on every screen, and each screen derives
 * its own viewport (and so its own data query) from them.
 *
 * - lat/lng: plain decimals, rounded to 5 places (~1 m); the centre must lie
 *   in the Latvia box widened by POSITION_MARGIN degrees.
 * - zoom: an integer MIN_POSITION_ZOOM..MAX_POSITION_ZOOM.
 * - All three or none: a partial, repeated or invalid position is dropped
 *   and the map opens on Latvia (the default, which is never written out).
 */

import { LATVIA_BOUNDS } from "./viewport";

export interface MapPosition {
  lat: number;
  lng: number;
  zoom: number;
}

export const POSITION_PARAM_KEYS = { lat: "lat", lng: "lng", zoom: "zoom" } as const;
export const MIN_POSITION_ZOOM = 6;
export const MAX_POSITION_ZOOM = 19;
/** How far (degrees) outside the Latvia box a centre may be: room to pan around the border. */
export const POSITION_MARGIN = 1;

const PRECISION = 1e5;
const DECIMAL = /^-?\d{1,3}(\.\d{1,12})?$/;

export function roundCoordinate(value: number): number {
  return Math.round(value * PRECISION) / PRECISION;
}

/** Validates and rounds a position; null when it is not a valid map position. */
export function normalizePosition(raw: {
  lat: number;
  lng: number;
  zoom: number;
}): MapPosition | null {
  const { lat, lng, zoom } = raw;
  if (![lat, lng, zoom].every(Number.isFinite) || !Number.isInteger(zoom)) {
    return null;
  }
  if (zoom < MIN_POSITION_ZOOM || zoom > MAX_POSITION_ZOOM) {
    return null;
  }
  if (
    lat < LATVIA_BOUNDS.south - POSITION_MARGIN ||
    lat > LATVIA_BOUNDS.north + POSITION_MARGIN ||
    lng < LATVIA_BOUNDS.west - POSITION_MARGIN ||
    lng > LATVIA_BOUNDS.east + POSITION_MARGIN
  ) {
    return null;
  }
  return { lat: roundCoordinate(lat), lng: roundCoordinate(lng), zoom };
}

type ParamsInput = URLSearchParams | Record<string, string | string[] | undefined>;

function all(params: ParamsInput, key: string): string[] {
  if (params instanceof URLSearchParams) {
    return params.getAll(key);
  }
  const value = params[key];
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

export interface ParsedPosition {
  position: MapPosition | null;
  /** True when any position parameter was present but the position was dropped. */
  hadInvalidPosition: boolean;
}

export function parsePosition(params: ParamsInput): ParsedPosition {
  const lat = all(params, POSITION_PARAM_KEYS.lat);
  const lng = all(params, POSITION_PARAM_KEYS.lng);
  const zoom = all(params, POSITION_PARAM_KEYS.zoom);
  const present = lat.length + lng.length + zoom.length > 0;
  if (
    lat.length !== 1 ||
    lng.length !== 1 ||
    zoom.length !== 1 ||
    !DECIMAL.test(lat[0]) ||
    !DECIMAL.test(lng[0]) ||
    !/^\d{1,2}$/.test(zoom[0])
  ) {
    return { position: null, hadInvalidPosition: present };
  }
  const position = normalizePosition({
    lat: Number(lat[0]),
    lng: Number(lng[0]),
    zoom: Number(zoom[0]),
  });
  return { position, hadInvalidPosition: position === null };
}

/** [key, value] pairs, or none for the default position. */
export function positionEntries(position: MapPosition | null): Array<[string, string]> {
  if (!position) {
    return [];
  }
  return [
    [POSITION_PARAM_KEYS.lat, String(roundCoordinate(position.lat))],
    [POSITION_PARAM_KEYS.lng, String(roundCoordinate(position.lng))],
    [POSITION_PARAM_KEYS.zoom, String(position.zoom)],
  ];
}

export function positionsEqual(a: MapPosition | null, b: MapPosition | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return (
    roundCoordinate(a.lat) === roundCoordinate(b.lat) &&
    roundCoordinate(a.lng) === roundCoordinate(b.lng) &&
    a.zoom === b.zoom
  );
}
