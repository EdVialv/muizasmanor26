"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import { objectTypeLabel } from "@/lib/directory/labels";
import { buildClusterIndex, type ClientFeature, type Stack } from "@/lib/map/clusterIndex";
import type { MapCluster, MapObject, MapResult } from "@/lib/map/mapQuery";
import type { TileConfig } from "@/lib/map/tileConfig";
import { INITIAL_BOUNDS, normalizeViewport, type Viewport } from "@/lib/map/viewport";

export interface LeafletMapProps {
  /** Null when no base map is configured: objects still show on a plain background. */
  tiles: TileConfig | null;
  result: MapResult | null;
  objectHref: (slug: string) => string;
  onViewportChange: (viewport: Viewport) => void;
  /** Called with true once tiles keep failing and none has loaded, false when one loads. */
  onTileFailure: (failed: boolean) => void;
}

/** Above this zoom nothing is clustered on the client; identical positions stay stacked. */
const CLIENT_CLUSTER_MAX_ZOOM = 17;
const MIN_MAP_ZOOM = 6;
const TILE_FAILURES_BEFORE_NOTICE = 4;

function toLatLngBounds(bounds: { west: number; south: number; east: number; north: number }) {
  return L.latLngBounds([bounds.south, bounds.west], [bounds.north, bounds.east]);
}

function countIcon(count: number, label: string, extraClass: string) {
  const size = count < 10 ? 34 : count < 100 ? 40 : count < 1000 ? 46 : 54;
  return L.divIcon({
    className: `mapCountMarker ${extraClass}`,
    html: `<span aria-hidden="true">${count}</span><span class="visuallyHidden">${label}</span>`,
    iconSize: [size, size],
  });
}

/** Popup content built as DOM nodes - names are data, never parsed as HTML. */
function objectListPopup(
  objects: MapObject[],
  objectHref: (slug: string) => string,
  heading?: string,
) {
  const root = document.createElement("div");
  root.className = "mapPopup";
  if (heading) {
    const title = document.createElement("p");
    title.className = "mapPopupHeading";
    title.textContent = heading;
    root.append(title);
  }
  const list = document.createElement("ul");
  list.className = "mapPopupList";
  for (const object of objects) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = objectHref(object.slug);
    link.textContent = object.name;
    const type = document.createElement("span");
    type.className = "mapPopupType";
    type.textContent = objectTypeLabel(object.objectType);
    item.append(link, type);
    list.append(item);
  }
  root.append(list);
  return root;
}

function objectsLabel(count: number): string {
  return count % 10 === 1 && count % 100 !== 11 ? `${count} objekts` : `${count} objekti`;
}

/**
 * The Leaflet map itself (docs/DAY19_MAP_NOTES.md). Browser-only: loaded
 * through next/dynamic with ssr: false by DirectoryMap.
 *
 * - Opens on Latvia; reports every settled move/zoom as a validated viewport.
 * - Canvas rendering for single objects (no DOM marker per object);
 *   clusters and stacks are a few DOM markers with a count. Markers are not
 *   Tab stops - a dense view would otherwise put hundreds of them between
 *   the map and the rest of the page. Keyboard users move and zoom the map
 *   with the arrow and +/- keys, and every object in view is listed as a
 *   link below the map (DirectoryMap).
 * - "objects" results are clustered on the client (Supercluster); objects
 *   at one position form a stack whose popup lists them all. "clusters"
 *   results are the server's exact grid counts; selecting one zooms to it.
 * - The scroll wheel zooms only after the map is clicked or focused, and
 *   stops again when the pointer leaves or focus moves on, so the page
 *   keeps scrolling past the map.
 */
export default function LeafletMap({
  tiles,
  result,
  objectHref,
  onViewportChange,
  onTileFailure,
}: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const callbacksRef = useRef({ onViewportChange, onTileFailure, objectHref });
  const maxZoom = tiles?.maxZoom ?? 19;

  useEffect(() => {
    callbacksRef.current = { onViewportChange, onTileFailure, objectHref };
  }, [onViewportChange, onTileFailure, objectHref]);

  const clusterIndex = useMemo(
    () =>
      result && result.objects.length > 0
        ? buildClusterIndex(result.objects, Math.min(CLIENT_CLUSTER_MAX_ZOOM, maxZoom - 1))
        : null,
    [result, maxZoom],
  );

  // Create the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const map = L.map(container, {
      preferCanvas: true,
      scrollWheelZoom: false,
      // A provider may intentionally stop below our preferred zoom. Keep
      // Leaflet's min/max range valid and let fitBounds show the widest
      // available view in that unusual configuration.
      minZoom: Math.min(MIN_MAP_ZOOM, maxZoom),
      maxZoom,
      keyboard: true,
      worldCopyJump: false,
    });
    map.attributionControl.setPrefix(
      '<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet</a>',
    );
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);

    if (tiles) {
      let loaded = 0;
      let failed = 0;
      L.tileLayer(tiles.urlTemplate, {
        attribution: tiles.attribution,
        maxZoom: tiles.maxZoom,
      })
        .on("tileload", () => {
          loaded += 1;
          if (failed >= TILE_FAILURES_BEFORE_NOTICE) {
            callbacksRef.current.onTileFailure(false);
          }
          failed = 0;
        })
        .on("tileerror", () => {
          failed += 1;
          if (failed === TILE_FAILURES_BEFORE_NOTICE && loaded === 0) {
            callbacksRef.current.onTileFailure(true);
          }
        })
        .addTo(map);
    }

    const report = () => {
      const bounds = map.getBounds();
      const viewport = normalizeViewport({
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
        zoom: map.getZoom(),
      });
      if (viewport) {
        callbacksRef.current.onViewportChange(viewport);
      }
    };
    map.on("moveend", report);

    // Wheel zoom only while the visitor is working with the map.
    const enableWheel = () => map.scrollWheelZoom.enable();
    const disableWheel = () => map.scrollWheelZoom.disable();
    map.on("click focus", enableWheel);
    map.on("blur mouseout", disableWheel);

    map.fitBounds(toLatLngBounds(INITIAL_BOUNDS));
    report();

    return () => {
      map.off();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // The map is created once; tile settings come from the server and do not change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw the current result, and redraw client clusters on every move.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) {
      return;
    }

    const draw = () => {
      layer.clearLayers();
      if (!result) {
        return;
      }
      const href = (slug: string) => callbacksRef.current.objectHref(slug);
      // Popups are opened on the map, not bound to a marker: markers are
      // redrawn after every move (including a popup's own auto-pan), and a
      // bound popup would close with its marker.
      const openPopup = (latitude: number, longitude: number, content: () => HTMLElement) =>
        L.popup({ maxWidth: 280 })
          .setLatLng([latitude, longitude])
          .setContent(content())
          .openOn(map);

      const drawObject = (object: MapObject) => {
        L.circleMarker([object.latitude, object.longitude], {
          radius: 7,
          weight: 2,
          color: "#fffdf8",
          fillColor: "#a6602b",
          fillOpacity: 1,
        })
          .on("click", () =>
            openPopup(object.latitude, object.longitude, () => objectListPopup([object], href)),
          )
          .bindTooltip(object.name)
          .addTo(layer);
      };

      const drawStack = (stack: Stack) => {
        if (stack.objects.length === 1) {
          drawObject(stack.objects[0]);
          return;
        }
        const label = `${objectsLabel(stack.objects.length)} vienā vietā - atvērt sarakstu`;
        L.marker([stack.latitude, stack.longitude], {
          icon: countIcon(stack.objects.length, label, "mapStackMarker"),
          title: label,
          keyboard: false,
        })
          .on("click", () =>
            openPopup(stack.latitude, stack.longitude, () =>
              objectListPopup(
                stack.objects,
                href,
                `${objectsLabel(stack.objects.length)} vienā vietā`,
              ),
            ),
          )
          .addTo(layer);
      };

      const drawServerCluster = (cluster: MapCluster) => {
        const label = `${objectsLabel(cluster.count)} - tuvināt`;
        L.marker([cluster.latitude, cluster.longitude], {
          icon: countIcon(cluster.count, label, "mapClusterMarker"),
          title: label,
          keyboard: false,
        })
          .on("click", () => {
            const bounds = toLatLngBounds(cluster.bounds);
            const target = map.getBoundsZoom(bounds.pad(0.2));
            if (target <= map.getZoom()) {
              map.setView(
                [cluster.latitude, cluster.longitude],
                Math.min(map.getZoom() + 2, maxZoom),
              );
            } else {
              map.fitBounds(bounds.pad(0.2));
            }
          })
          .addTo(layer);
      };

      const drawClientFeature = (feature: ClientFeature) => {
        if (feature.kind === "stack") {
          drawStack(feature.stack);
          return;
        }
        const index = clusterIndex;
        const splits = feature.expansionZoom <= maxZoom;
        const label = splits
          ? `${objectsLabel(feature.count)} - tuvināt`
          : `${objectsLabel(feature.count)} - atvērt sarakstu`;
        const marker = L.marker([feature.latitude, feature.longitude], {
          icon: countIcon(feature.count, label, "mapClusterMarker"),
          title: label,
          keyboard: false,
        });
        if (splits) {
          marker.on("click", () =>
            map.setView([feature.latitude, feature.longitude], feature.expansionZoom),
          );
        } else if (index) {
          marker.on("click", () =>
            openPopup(feature.latitude, feature.longitude, () =>
              objectListPopup(
                index.objectsIn(feature.clusterId),
                href,
                objectsLabel(feature.count),
              ),
            ),
          );
        }
        marker.addTo(layer);
      };

      if (result.mode === "clusters") {
        result.clusters.forEach(drawServerCluster);
        result.objects.forEach(drawObject);
      } else if (clusterIndex) {
        const bounds = map.getBounds();
        clusterIndex
          .features(
            {
              west: bounds.getWest(),
              south: bounds.getSouth(),
              east: bounds.getEast(),
              north: bounds.getNorth(),
            },
            map.getZoom(),
          )
          .forEach(drawClientFeature);
      }
    };

    draw();
    map.on("moveend", draw);
    return () => {
      map.off("moveend", draw);
    };
  }, [result, clusterIndex, maxZoom]);

  return (
    <div
      ref={containerRef}
      className="directoryMapCanvas"
      role="region"
      aria-label="Karte. Bultiņu taustiņi pārvieto karti, plus un mīnus tuvina un attālina."
    />
  );
}
