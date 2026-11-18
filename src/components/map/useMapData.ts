"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listingSearchParams, type DirectoryListing } from "@/lib/directory/filters";
import { MAP_API_PATH, parseMapResponse, type MapResult } from "@/lib/map/mapQuery";
import { formatBbox, type Viewport } from "@/lib/map/viewport";

export const MAP_FETCH_DEBOUNCE_MS = 300;

export type MapDataState =
  | { kind: "idle" }
  | { kind: "loading"; previous: MapResult | null }
  | { kind: "ready"; result: MapResult }
  | { kind: "error"; previous: MapResult | null };

/** The API URL for one viewport of one listing: canonical listing params, bbox and zoom, no cursor. */
export function mapDataHref(listing: DirectoryListing, viewport: Viewport): string {
  const params = listingSearchParams(listing);
  params.set("bbox", formatBbox(viewport));
  params.set("zoom", String(viewport.zoom));
  return `${MAP_API_PATH}?${params.toString()}`;
}

/**
 * Loads the map's objects for the current listing and viewport
 * (docs/DAY19_MAP_NOTES.md):
 *
 * - waits MAP_FETCH_DEBOUNCE_MS after the last viewport or listing change,
 *   so panning and quick filter changes cost one request, not dozens;
 * - aborts the previous request when a new one starts, and ignores any
 *   answer that is not for the newest request - an older, slower response
 *   can never replace newer data;
 * - does not fetch while the page is hidden; it catches up when the page
 *   becomes visible again;
 * - keeps the previous result on screen while loading or after an error.
 */
export function useMapData(
  listing: DirectoryListing,
  viewport: Viewport | null,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): { state: MapDataState; retry: () => void } {
  const [state, setState] = useState<MapDataState>({ kind: "idle" });
  const requestRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const lastResultRef = useRef<MapResult | null>(null);
  const pendingHrefRef = useRef<string | null>(null);
  const fetchRef = useRef(fetchImpl);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    fetchRef.current = fetchImpl;
  }, [fetchImpl]);

  const href = viewport ? mapDataHref(listing, viewport) : null;

  const load = useCallback((target: string) => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      // Nothing is drawn while hidden; fetch when the page is shown again.
      pendingHrefRef.current = target;
      return;
    }
    pendingHrefRef.current = null;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const request = ++requestRef.current;
    setState({ kind: "loading", previous: lastResultRef.current });

    fetchRef
      .current(target, { signal: controller.signal })
      .then(async (response) => {
        const result = response.ok ? parseMapResponse(await response.json()) : null;
        if (request !== requestRef.current) {
          return;
        }
        if (result) {
          lastResultRef.current = result;
          setState({ kind: "ready", result });
        } else {
          setState({ kind: "error", previous: lastResultRef.current });
        }
      })
      .catch((error: unknown) => {
        if (request !== requestRef.current || (error as Error)?.name === "AbortError") {
          return;
        }
        setState({ kind: "error", previous: lastResultRef.current });
      });
  }, []);

  useEffect(() => {
    if (!href) {
      return;
    }
    const timer = setTimeout(() => load(href), MAP_FETCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [href, load, retryCount]);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "visible" && pendingHrefRef.current) {
        load(pendingHrefRef.current);
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      controllerRef.current?.abort();
    };
  }, [load]);

  const retry = useCallback(() => setRetryCount((count) => count + 1), []);

  return { state, retry };
}
