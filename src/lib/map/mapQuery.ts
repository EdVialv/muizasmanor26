/**
 * The map's viewport query (docs/DAY19_MAP_NOTES.md): one call to the
 * database function public_map_objects through the anon-key client, with
 * the same search and filter arguments as the list (listingRpcArgs), so the
 * list and the map always send one selection in one form.
 *
 * The result is either every matching object in the viewport as a point
 * ("objects") or grid clusters with exact counts ("clusters") - never a
 * truncated point list: the database switches to clusters above
 * MAX_MAP_OBJECTS (src/lib/map/viewport.ts) matches.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DirectoryListing } from "@/lib/directory/filters";
import { listingRpcArgs } from "@/lib/directory/supabaseSearchDataSource";
import { isValidMapLocation, type Bounds, type Viewport } from "./viewport";

export const MAP_FUNCTION = "public_map_objects";
export const MAP_API_PATH = "/api/directory/map";

export interface MapObject {
  id: string;
  slug: string;
  name: string;
  objectType: string;
  latitude: number;
  longitude: number;
}

export interface MapCluster {
  latitude: number;
  longitude: number;
  count: number;
  /** The members' extent: zooming to it shows them. */
  bounds: Bounds;
}

export interface MapResult {
  /**
   * "objects": `objects` is every match in the viewport (at most
   * MAX_MAP_OBJECTS, or - when every grid cell of a dense viewport holds a
   * single object - one point per cell). "clusters": some matches are only
   * counted, in `clusters`; `objects` holds single-object cells.
   */
  mode: "objects" | "clusters";
  objects: MapObject[];
  clusters: MapCluster[];
  /** The exact number of matching objects in the viewport. */
  total: number;
}

interface RawMapRow {
  kind: unknown;
  id: unknown;
  slug: unknown;
  name_lv: unknown;
  object_type: unknown;
  latitude: unknown;
  longitude: unknown;
  object_count: unknown;
  min_latitude: unknown;
  min_longitude: unknown;
  max_latitude: unknown;
  max_longitude: unknown;
}

const num = (value: unknown) => (typeof value === "number" ? value : Number(value));
const str = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : null);

/**
 * Turns database rows into a MapResult. Rows that are malformed or carry a
 * position outside the valid map area are dropped (the database already
 * excludes them; this is a second line, never a repair).
 */
export function toMapResult(rows: RawMapRow[]): MapResult {
  const objects: MapObject[] = [];
  const clusters: MapCluster[] = [];
  let total = 0;
  for (const row of rows) {
    const latitude = num(row.latitude);
    const longitude = num(row.longitude);
    if (!isValidMapLocation(latitude, longitude)) {
      continue;
    }
    if (row.kind === "object") {
      const id = str(row.id);
      const slug = str(row.slug);
      const name = str(row.name_lv);
      const objectType = str(row.object_type);
      if (id && slug && name && objectType) {
        objects.push({ id, slug, name, objectType, latitude, longitude });
        total += 1;
      }
    } else if (row.kind === "cluster") {
      const count = num(row.object_count);
      const bounds = {
        south: num(row.min_latitude),
        west: num(row.min_longitude),
        north: num(row.max_latitude),
        east: num(row.max_longitude),
      };
      if (Number.isInteger(count) && count > 0 && Object.values(bounds).every(Number.isFinite)) {
        clusters.push({ latitude, longitude, count, bounds });
        total += count;
      }
    }
  }
  return { mode: clusters.length > 0 ? "clusters" : "objects", objects, clusters, total };
}

export async function fetchMapViewport(
  client: SupabaseClient,
  viewport: Viewport,
  listing: DirectoryListing,
): Promise<MapResult> {
  const { data, error } = await client.rpc(MAP_FUNCTION, {
    west: viewport.west,
    south: viewport.south,
    east: viewport.east,
    north: viewport.north,
    zoom: viewport.zoom,
    ...listingRpcArgs(listing.q, listing.filters),
  });
  if (error) {
    throw error;
  }
  return toMapResult((data ?? []) as RawMapRow[]);
}

/** Validates a JSON body from the route handler; anything unexpected becomes null. */
export function parseMapResponse(body: unknown): MapResult | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const { mode, objects, clusters, total } = body as Partial<MapResult>;
  if (
    (mode !== "objects" && mode !== "clusters") ||
    !Array.isArray(objects) ||
    !Array.isArray(clusters) ||
    typeof total !== "number"
  ) {
    return null;
  }
  const rows: RawMapRow[] = [
    ...objects.map((o) => ({
      kind: "object",
      id: o?.id,
      slug: o?.slug,
      name_lv: o?.name,
      object_type: o?.objectType,
      latitude: o?.latitude,
      longitude: o?.longitude,
      object_count: 1,
      min_latitude: null,
      min_longitude: null,
      max_latitude: null,
      max_longitude: null,
    })),
    ...clusters.map((c) => ({
      kind: "cluster",
      id: null,
      slug: null,
      name_lv: null,
      object_type: null,
      latitude: c?.latitude,
      longitude: c?.longitude,
      object_count: c?.count,
      min_latitude: c?.bounds?.south,
      min_longitude: c?.bounds?.west,
      max_latitude: c?.bounds?.north,
      max_longitude: c?.bounds?.east,
    })),
  ];
  return toMapResult(rows);
}
