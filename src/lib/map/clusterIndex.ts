/**
 * Client-side clustering of a complete point set ("objects" mode -
 * docs/DAY19_MAP_NOTES.md), with Supercluster.
 *
 * Objects at exactly the same position are first grouped into one "stack",
 * so they can never hide each other: a stack is shown as one marker with a
 * count, and selecting it lists every object in it. Supercluster then
 * clusters stacks at wider zoom levels; a cluster's count is the number of
 * objects (not stacks) inside it.
 *
 * Pure and DOM-free, so it is unit-tested without Leaflet.
 */

import Supercluster from "supercluster";
import type { MapObject } from "./mapQuery";
import type { Bounds } from "./viewport";

export interface Stack {
  latitude: number;
  longitude: number;
  /** Every object at this exact position, in name order. */
  objects: MapObject[];
}

export type ClientFeature =
  | { kind: "stack"; stack: Stack }
  | {
      kind: "cluster";
      clusterId: number;
      latitude: number;
      longitude: number;
      count: number;
      /** The zoom at which this cluster splits; above the map's maximum it never does. */
      expansionZoom: number;
    };

interface StackProps {
  stack: Stack;
  size: number;
}

interface ClusterProps {
  size: number;
}

export interface ClusterIndex {
  features(bounds: Bounds, zoom: number): ClientFeature[];
  /** Every object in a cluster, in name order (for a cluster that cannot split further). */
  objectsIn(clusterId: number): MapObject[];
}

const collator = new Intl.Collator("lv");

/** Groups objects by exact position; each stack's objects in Latvian name order. */
export function stackByPosition(objects: MapObject[]): Stack[] {
  const byPosition = new Map<string, Stack>();
  for (const object of objects) {
    const key = `${object.latitude},${object.longitude}`;
    const stack = byPosition.get(key);
    if (stack) {
      stack.objects.push(object);
    } else {
      byPosition.set(key, {
        latitude: object.latitude,
        longitude: object.longitude,
        objects: [object],
      });
    }
  }
  const stacks = [...byPosition.values()];
  for (const stack of stacks) {
    stack.objects.sort((a, b) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id));
  }
  return stacks;
}

export function buildClusterIndex(objects: MapObject[], maxZoom: number): ClusterIndex {
  const index = new Supercluster<StackProps, ClusterProps>({
    radius: 48,
    maxZoom,
    map: (props) => ({ size: props.size }),
    reduce: (accumulated, props) => {
      accumulated.size += props.size;
    },
  });
  index.load(
    stackByPosition(objects).map((stack) => ({
      type: "Feature" as const,
      properties: { stack, size: stack.objects.length },
      geometry: { type: "Point" as const, coordinates: [stack.longitude, stack.latitude] },
    })),
  );

  return {
    features(bounds, zoom) {
      return index
        .getClusters([bounds.west, bounds.south, bounds.east, bounds.north], Math.round(zoom))
        .map((feature): ClientFeature => {
          const [longitude, latitude] = feature.geometry.coordinates;
          const props = feature.properties as Partial<StackProps> &
            Partial<ClusterProps> & { cluster?: boolean; cluster_id?: number };
          if (props.cluster && typeof props.cluster_id === "number") {
            return {
              kind: "cluster",
              clusterId: props.cluster_id,
              latitude,
              longitude,
              count: props.size ?? 0,
              expansionZoom: index.getClusterExpansionZoom(props.cluster_id),
            };
          }
          return { kind: "stack", stack: props.stack as Stack };
        });
    },
    objectsIn(clusterId) {
      return index
        .getLeaves(clusterId, Infinity)
        .flatMap((leaf) => (leaf.properties as StackProps).stack.objects)
        .sort((a, b) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id));
    },
  };
}
