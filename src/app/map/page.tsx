import type { Metadata } from "next";
import DirectoryMap from "@/components/map/DirectoryMap";
import { buildBrowseHref, parseBrowseState } from "@/lib/directory/browseState";
import { DIRECTORY_PATH } from "@/lib/directory/links";
import { readTileConfig } from "@/lib/map/tileConfig";

export const metadata: Metadata = {
  title: "Karte",
  description: "Latvijas muižas un kultūrvēsturiskie objekti kartē.",
};

type MapPageSearchParams = Record<string, string | string[] | undefined>;

/**
 * /map (Day 19 - docs/DAY19_MAP_NOTES.md). Rendered inside ./layout.tsx,
 * which provides the heading, list/map switch, search field, filter panel
 * and shared listing state. The tile configuration is read here, on the
 * server, from environment variables (src/lib/map/tileConfig.ts).
 *
 * Without JavaScript the map cannot work; the page then offers the same
 * search and filters as a list.
 */
export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<MapPageSearchParams>;
}) {
  const params = await searchParams;
  const { state } = parseBrowseState(params);
  const tiles = readTileConfig();

  return (
    <>
      <noscript>
        <p className="directoryStatusNotice">
          Kartei nepieciešams JavaScript.{" "}
          <a href={buildBrowseHref(DIRECTORY_PATH, state)}>Skatīt tos pašus objektus sarakstā</a>.
        </p>
      </noscript>
      <DirectoryMap tiles={tiles} />
    </>
  );
}
