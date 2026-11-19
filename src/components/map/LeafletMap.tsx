"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import { objectTypeLabel } from "@/lib/directory/labels";
import { buildClusterIndex, type ClientFeature, type Stack } from "@/lib/map/clusterIndex";
import type { MapCluster, MapObject, MapResult } from "@/lib/map/mapQuery";
import type { TileConfig } from "@/lib/map/tileConfig";
import { normalizePosition, positionsEqual, type MapPosition } from "@/lib/map/position";
import { INITIAL_BOUNDS, normalizeViewport, type Viewport } from "@/lib/map/viewport";

export interface LeafletMapProps {
  /** Null when no base map is configured: objects still show on a plain background. */
  tiles: TileConfig | null;
  result: MapResult | null;
  objectHref: (slug: string) => string;
  /** The intended position (Day 20): null shows all of Latvia. */
  position: MapPosition | null;
  /**
   * Changes when the position was restored from the URL (Back/Forward, a
   * link); the map then moves to `position` programmatically.
   */
  positionEpoch: number;
  /** A position the visitor moved to, with the epoch the move happened in. */
  onPositionChange: (position: MapPosition, epoch: number) => void;
  onViewportChange: (viewport: Viewport) => void;
  /** Called with true once tiles keep failing and none has loaded, false when one loads. */
  onTileFailure: (failed: boolean) => void;
  selectedObjectId?: string | null;
  onObjectSelect?: (id: string) => void;
}

/** Above this zoom nothing is clustered on the client; identical positions stay stacked. */
const CLIENT_CLUSTER_MAX_ZOOM = 17;
const MIN_MAP_ZOOM = 6;
const TILE_FAILURES_BEFORE_NOTICE = 4;
/** A settled move is written to the URL this long after the last moveend. */
export const MAP_URL_DEBOUNCE_MS = 400;

/**
 * True when `position` is where the map already is, to within a pixel.
 * Leaflet keeps the exact centre only until the next resize; after that the
 * centre is recomputed from whole pixels and can differ from the URL's by
 * a fraction of a pixel - a difference the visitor cannot see, which must
 * not be written back as a "move".
 */
function showsPosition(map: L.Map, position: MapPosition | null): boolean {
  if (!position || map.getZoom() !== position.zoom) {
    return false;
  }
  const zoom = position.zoom;
  const here = map.project(map.getCenter(), zoom);
  const there = map.project([position.lat, position.lng], zoom);
  return here.distanceTo(there) < 1;
}

function currentPosition(map: L.Map): MapPosition | null {
  const center = map.getCenter();
  return normalizePosition({ lat: center.lat, lng: center.lng, zoom: map.getZoom() });
}

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

/** Moves the map, without animation, to a position or to the default view of Latvia. */
function showPosition(
  map: L.Map,
  position: MapPosition | null,
  defaultViewRef: { current: MapPosition | null },
) {
  if (position) {
    map.setView([position.lat, position.lng], position.zoom, { animate: false });
  } else {
    map.fitBounds(toLatLngBounds(INITIAL_BOUNDS), { animate: false });
    defaultViewRef.current = currentPosition(map);
  }
}

/**
 * The Leaflet map itself (docs/DAY19_MAP_NOTES.md). Browser-only: loaded
 * through next/dynamic with ssr: false by DirectoryMap.
 *
 * - Opens at the URL's position (Day 20), or on Latvia; reports every
 *   settled move/zoom as a validated viewport (for data) and, debounced, as
 *   a position (for the URL). Programmatic moves - the first view, a
 *   restore after Back/Forward - are never reported as positions: a
 *   reported position must differ from both the intended position and the
 *   default view, so restoring cannot echo back into the URL.
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
  position,
  positionEpoch,
  onPositionChange,
  onViewportChange,
  onTileFailure,
  selectedObjectId,
  onObjectSelect,
}: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const callbacksRef = useRef({
    onViewportChange,
    onTileFailure,
    objectHref,
    onPositionChange,
    onObjectSelect,
  });
  const maxZoom = tiles?.maxZoom ?? 19;
  // The intended position and its epoch, as of the last render.
  const positionRef = useRef(position);
  const epochRef = useRef(positionEpoch);
  // The default (fitted Latvia) view, once it has been shown; never written to the URL.
  const defaultViewRef = useRef<MapPosition | null>(null);
  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    callbacksRef.current = {
      onViewportChange,
      onTileFailure,
      objectHref,
      onPositionChange,
      onObjectSelect,
    };
    positionRef.current = position;
  }, [onViewportChange, onTileFailure, objectHref, onPositionChange, onObjectSelect, position]);

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

    // Debounced: a drag or a zoom animation ends in several moveends.
    const scheduleWrite = () => {
      if (writeTimerRef.current !== null) {
        clearTimeout(writeTimerRef.current);
      }
      const epoch = epochRef.current;
      writeTimerRef.current = setTimeout(() => {
        writeTimerRef.current = null;
        if (epoch !== epochRef.current) {
          return;
        }
        const next = currentPosition(map);
        const intended = positionRef.current;
        if (
          next === null ||
          positionsEqual(next, intended) ||
          showsPosition(map, intended) ||
          (intended === null && showsPosition(map, defaultViewRef.current))
        ) {
          return;
        }
        callbacksRef.current.onPositionChange(next, epoch);
      }, MAP_URL_DEBOUNCE_MS);
    };
    map.on("moveend", scheduleWrite);

    // Wheel zoom only while the visitor is working with the map.
    const enableWheel = () => map.scrollWheelZoom.enable();
    const disableWheel = () => map.scrollWheelZoom.disable();
    map.on("click focus", enableWheel);
    map.on("blur mouseout", disableWheel);

    showPosition(map, positionRef.current, defaultViewRef);
    report();

    return () => {
      if (writeTimerRef.current !== null) {
        clearTimeout(writeTimerRef.current);
      }
      map.off();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // The map is created once; tile settings come from the server and do not change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back/Forward or a link restored a position: drop a pending write from
  // before it and move the map there. The resulting moveend is not written
  // back - the map is now at the intended position (or the default view).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || epochRef.current === positionEpoch) {
      return;
    }
    epochRef.current = positionEpoch;
    positionRef.current = position;
    if (writeTimerRef.current !== null) {
      clearTimeout(writeTimerRef.current);
      writeTimerRef.current = null;
    }
    if (!positionsEqual(currentPosition(map), position)) {
      showPosition(map, position, defaultViewRef);
    }
  }, [positionEpoch, position]);

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
          radius: object.id === selectedObjectId ? 10 : 7,
          weight: 2,
          color: "#ffffff",
          fillColor: object.id === selectedObjectId ? "#c99a38" : "#59633c",
          fillOpacity: 1,
        })
          .on("click", () => {
            callbacksRef.current.onObjectSelect?.(object.id);
            openPopup(object.latitude, object.longitude, () => objectListPopup([object], href));
          })
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
  }, [result, clusterIndex, maxZoom, selectedObjectId]);

  const selectedObject = result?.objects.find((object) => object.id === selectedObjectId);
  const selectedRef = useRef(selectedObject);
  useEffect(() => {
    selectedRef.current = selectedObject;
  }, [selectedObject]);
  useEffect(() => {
    const map = mapRef.current;
    const object = selectedRef.current;
    if (!map || !object) return;
    map.setView(
      [object.latitude, object.longitude],
      Math.min(Math.max(map.getZoom(), 12), maxZoom),
    );
    L.popup({ maxWidth: 280 })
      .setLatLng([object.latitude, object.longitude])
      .setContent(objectListPopup([object], callbacksRef.current.objectHref))
      .openOn(map);
  }, [selectedObjectId, maxZoom]);

  // Sidebar expansion and responsive columns change the canvas after mount.
  // A resize is not a move by the visitor: the centre is kept (pan: true;
  // the design branch used pan: false, which kept the top-left corner and
  // moved the centre, rewriting a shared Day 20 position), and the default
  // view is re-fitted to the new size. Any sub-pixel drift is ignored by
  // showsPosition(), so nothing is written back.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const map = mapRef.current;
      // Not while the map is being removed (detached or zero-sized), and
      // only for a real size change: invalidateSize() drops Leaflet's exact
      // centre even when nothing changed.
      if (!map || !container.isConnected || !container.clientWidth || !container.clientHeight) {
        return;
      }
      const size = map.getSize();
      if (size.x === container.clientWidth && size.y === container.clientHeight) {
        return;
      }
      const atDefault = positionRef.current === null && showsPosition(map, defaultViewRef.current);
      map.invalidateSize({ pan: true, animate: false });
      if (atDefault) {
        // The default view is "all of Latvia": fit it to the new size.
        showPosition(map, null, defaultViewRef);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="directoryMapCanvas"
      role="region"
      aria-label="Karte. Bultiņu taustiņi pārvieto karti, plus un mīnus tuvina un attālina."
    />
  );
}
