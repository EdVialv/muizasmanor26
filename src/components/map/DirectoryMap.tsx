"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useDirectoryListing } from "@/components/DirectoryListingProvider";
import { buildBrowseHref } from "@/lib/directory/browseState";
import { hasActiveFilters } from "@/lib/directory/filters";
import { objectTypeLabel } from "@/lib/directory/labels";
import { DIRECTORY_PATH, buildObjectHref } from "@/lib/directory/links";
import type { MapResult } from "@/lib/map/mapQuery";
import type { TileConfigOutcome } from "@/lib/map/tileConfig";
import type { Viewport } from "@/lib/map/viewport";
import type { LeafletMapProps } from "./LeafletMap";
import { useMapData } from "./useMapData";

function MapLoadFailed() {
  return (
    <div className="directoryMapCanvas directoryMapFallback" role="alert">
      <p>Karti neizdevās ielādēt. Objektus var pārlūkot sarakstā.</p>
    </div>
  );
}

// Leaflet touches `window` on import: load it only in the browser. A failed
// chunk load shows a message instead of breaking the page.
const LeafletMap = dynamic<LeafletMapProps>(
  () =>
    import("./LeafletMap").catch(() => ({
      default: MapLoadFailed as unknown as React.ComponentType<LeafletMapProps>,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="directoryMapCanvas directoryMapFallback" aria-busy="true">
        <p>Ielādē karti…</p>
      </div>
    ),
  },
);

const collator = new Intl.Collator("lv");

function objectsCount(count: number): string {
  return count % 10 === 1 && count % 100 !== 11 ? `${count} objekts` : `${count} objekti`;
}

/**
 * The map view (Day 19 - docs/DAY19_MAP_NOTES.md): the Leaflet map, its
 * status line and an accessible list of the objects in view.
 *
 * It reads the latest intended search and filters from the shared listing
 * state (the same one the search field and filter panel change), and never
 * navigates itself - so map interactions cannot reintroduce the Day 17
 * search/filter races.
 *
 * Day 20 (docs/DAY20_URL_STATE_NOTES.md): the map position lives in the
 * same shared state and in the URL (`lat`, `lng`, `zoom`). The map opens at
 * the URL's position - before its first data request - and the visitor's
 * moves are written back (debounced, replacing the history entry).
 * Back/Forward moves the map to the restored position without writing it
 * back.
 */
export default function DirectoryMap({ tiles }: { tiles: TileConfigOutcome }) {
  const { listing, cursor, position, epoch, setMapPosition } = useDirectoryListing();
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [tilesFailed, setTilesFailed] = useState(false);
  const { state, retry } = useMapData(listing, viewport);

  const result: MapResult | null =
    state.kind === "ready" ? state.result : state.kind === "idle" ? null : state.previous;

  const objectHref = useCallback(
    (slug: string) =>
      buildObjectHref(slug, {
        ...(listing.q ? { q: listing.q } : {}),
        ...(hasActiveFilters(listing.filters) ? { filters: listing.filters } : {}),
        ...(cursor ? { cursor } : {}),
        ...(position ? { position } : {}),
        view: "map",
      }),
    [listing, cursor, position],
  );

  // The whole selection as a list, from its first page; the map position is
  // kept for the way back.
  const listHref = buildBrowseHref(DIRECTORY_PATH, { listing, cursor: null, position });
  const filtered = listing.q !== null || hasActiveFilters(listing.filters);
  const tileConfig =
    tiles.kind === "configured" || tiles.kind === "development_default" ? tiles.config : null;

  const sortedObjects = useMemo(
    () =>
      result
        ? [...result.objects].sort(
            (a, b) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id),
          )
        : [],
    [result],
  );

  let status: string;
  if (state.kind === "idle" || (state.kind === "loading" && !state.previous)) {
    status = "Ielādē objektus…";
  } else if (state.kind === "error") {
    status = "Kartes objektus neizdevās ielādēt.";
  } else if (!result || result.total === 0) {
    status = filtered
      ? "Šajā kartes skatā nav neviena objekta, kas atbilst meklēšanai un filtriem."
      : "Šajā kartes skatā nav neviena objekta.";
  } else if (result.mode === "clusters") {
    status = `Šajā kartes skatā: ${objectsCount(result.total)}. Tie ir apvienoti grupās - tuviniet karti, lai redzētu atsevišķus objektus.`;
  } else {
    status = `Šajā kartes skatā: ${objectsCount(result.total)}.`;
  }
  const loadingAgain = state.kind === "loading" && state.previous !== null;

  return (
    <div className="directoryMap">
      {tiles.kind === "missing" || tiles.kind === "invalid" ? (
        <p className="directoryStatusNotice" role="status">
          Pamatkarte nav pieejama, tāpēc objekti rādīti bez kartes fona.
        </p>
      ) : null}
      {tilesFailed ? (
        <p className="directoryStatusNotice" role="status">
          Kartes fona attēlus neizdevās ielādēt. Objekti joprojām ir redzami un pieejami sarakstā.
        </p>
      ) : null}

      <LeafletMap
        tiles={tileConfig}
        result={result}
        objectHref={objectHref}
        position={position}
        positionEpoch={epoch}
        onPositionChange={setMapPosition}
        onViewportChange={setViewport}
        onTileFailure={setTilesFailed}
      />

      <div className="directoryMapStatus">
        <p role="status" aria-live="polite">
          {status}
          {loadingAgain ? " Atjauno…" : ""}
        </p>
        {state.kind === "error" ? (
          <button type="button" className="directoryTextButton" onClick={retry}>
            Mēģināt vēlreiz
          </button>
        ) : null}
        <p className="directoryMapNote">
          Kartē ir tikai objekti ar derīgām koordinātām Latvijā.{" "}
          <Link href={listHref}>
            {filtered ? "Visi atlasītie objekti sarakstā" : "Visi objekti sarakstā"}
          </Link>
        </p>
      </div>

      <section className="directoryMapList" aria-labelledby="directory-map-list-heading">
        <h2 id="directory-map-list-heading" className="directoryResultsHeading">
          Objekti šajā kartes skatā
        </h2>
        {result && result.mode === "clusters" ? (
          <p>
            Šajā skatā ir pārāk daudz objektu, lai tos uzskaitītu. Tuviniet karti vai{" "}
            <Link href={listHref}>pārlūkojiet sarakstu</Link>.
          </p>
        ) : sortedObjects.length > 0 ? (
          <ul className="directoryMapListItems">
            {sortedObjects.map((object) => (
              <li key={object.id}>
                <Link href={objectHref(object.slug)}>{object.name}</Link>
                <span className="directoryMapListType">{objectTypeLabel(object.objectType)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>Nav objektu, ko uzskaitīt.</p>
        )}
      </section>
    </div>
  );
}
