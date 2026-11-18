import type { Metadata } from "next";
import Link from "next/link";
import HeritageObjectCard from "@/components/HeritageObjectCard";
import { decodeCursor, encodeCursor, type DirectoryCursor } from "@/lib/directory/cursor";
import { buildBrowseHref, parseBrowseState } from "@/lib/directory/browseState";
import {
  EMPTY_FILTERS,
  hasActiveFilters,
  isPlainDirectory,
  type DirectoryListing,
} from "@/lib/directory/filters";
import { DIRECTORY_PATH, type DirectoryContext } from "@/lib/directory/links";
import {
  DIRECTORY_PAGE_SIZE,
  DirectoryConfigurationError,
  DirectoryQueryError,
  fetchDirectoryPage,
  type DirectoryPageResult,
} from "@/lib/directory/queries";
import { fetchListingPage } from "@/lib/directory/search";
import { createDirectoryDataSourceFromEnv } from "@/lib/directory/supabaseDataSource";
import { createDirectorySearchDataSourceFromEnv } from "@/lib/directory/supabaseSearchDataSource";

export const metadata: Metadata = {
  title: "Objekti",
  description: "Latvijas muižu un kultūrvēsturisko objektu katalogs.",
};

type ObjectsPageSearchParams = Record<string, string | string[] | undefined>;

type LoadOutcome =
  | { kind: "ok"; result: DirectoryPageResult }
  | { kind: "configuration_error" }
  | { kind: "query_error" };

/**
 * The plain directory keeps its reviewed Day 13 path. Any search or filter
 * goes through one database function that applies the search and every
 * filter in the same query, in the same (name_lv, id) keyset order
 * (docs/DAY17_DIRECTORY_FILTERS_NOTES.md). Nothing from a failure is
 * returned to the render beyond its kind.
 */
async function loadPage(
  listing: DirectoryListing,
  cursor: DirectoryCursor | null,
): Promise<LoadOutcome> {
  try {
    const result = isPlainDirectory(listing)
      ? await fetchDirectoryPage(createDirectoryDataSourceFromEnv(), cursor, DIRECTORY_PAGE_SIZE)
      : await fetchListingPage(
          createDirectorySearchDataSourceFromEnv(),
          listing,
          cursor,
          DIRECTORY_PAGE_SIZE,
        );
    return { kind: "ok", result };
  } catch (error) {
    if (error instanceof DirectoryConfigurationError) {
      console.error("[objects] directory data source is not configured:", error.message);
      return { kind: "configuration_error" };
    }
    if (error instanceof DirectoryQueryError) {
      console.error("[objects] directory query failed:", error.cause);
      return { kind: "query_error" };
    }
    console.error("[objects] unexpected error loading the directory:", error);
    return { kind: "query_error" };
  }
}

/**
 * Rendered inside ./layout.tsx, which provides the section, container,
 * heading, search field and filter panel (so they survive while results
 * load).
 */
export default async function ObjectsPage({
  searchParams,
}: {
  searchParams: Promise<ObjectsPageSearchParams>;
}) {
  const params = await searchParams;

  // The whole browse state (Day 20 - lib/directory/browseState.ts), validated
  // and in canonical form. Unknown filter values are dropped (and noted),
  // never passed on. A cursor is used only when it decodes AND belongs to
  // this exact listing - same search, same filters. Anything else -
  // malformed, repeated, tampered, or carried over from a different search
  // or filter set - fails safely to the first page of the current listing,
  // with a notice. The map position is not used by the list (map bounds
  // never restrict it); it is only carried on in links, so the map can be
  // restored.
  const {
    state: browse,
    hadInvalidValues,
    hadInvalidCursor: cursorWasInvalid,
  } = parseBrowseState(params);
  const { listing, cursor: rawCursor, position } = browse;
  const filtered = hasActiveFilters(listing.filters);
  const cursor = decodeCursor(rawCursor);

  const outcome = await loadPage(listing, cursor);
  // Cards carry the whole listing and (validated) cursor, so an object page
  // can link back to this same page of these same results.
  const directoryContext: DirectoryContext = {
    ...(listing.q ? { q: listing.q } : {}),
    ...(filtered ? { filters: listing.filters } : {}),
    ...(cursor && rawCursor ? { cursor: rawCursor } : {}),
    ...(position ? { position } : {}),
  };
  const searchOnlyHref = buildBrowseHref(DIRECTORY_PATH, {
    listing: { q: listing.q, filters: EMPTY_FILTERS },
    cursor: null,
    position,
  });

  return (
    <>
      {hadInvalidValues ? (
        <p className="directoryStatusNotice" role="status">
          Daži saites filtri nebija derīgi un netika ņemti vērā.
        </p>
      ) : null}

      {cursorWasInvalid ? (
        <p className="directoryStatusNotice" role="status">
          Saite uz šo lapu bija nederīga — rādīta pirmā lapa.
        </p>
      ) : null}

      {!isPlainDirectory(listing) && outcome.kind === "ok" && outcome.result.items.length > 0 ? (
        <h2 className="directoryResultsHeading">
          {listing.q ? <>Meklēšanas rezultāti: „{listing.q}”</> : <>Atlasītie objekti</>}
          {listing.q && filtered ? ", ar filtriem" : ""}
          {cursor ? " (turpinājums)" : ""}
        </h2>
      ) : null}

      {outcome.kind === "configuration_error" ? (
        <div className="directoryStatus" role="alert">
          <h2>Katalogs nav pieejams</h2>
          <p>Datu pieslēgums šobrīd nav konfigurēts. Lūdzu, apmeklējiet vēlāk.</p>
        </div>
      ) : outcome.kind === "query_error" ? (
        <div className="directoryStatus" role="alert">
          {!isPlainDirectory(listing) ? (
            <>
              <h2>{filtered ? "Atlase neizdevās" : "Meklēšana neizdevās"}</h2>
              <p>Šobrīd nevaram atlasīt objektus. Lūdzu, mēģiniet vēlreiz vai apmeklējiet vēlāk.</p>
              <p>
                <Link className="directoryPaginationLink" href={DIRECTORY_PATH}>
                  Rādīt visu katalogu
                </Link>
              </p>
            </>
          ) : (
            <>
              <h2>Neizdevās ielādēt sarakstu</h2>
              <p>
                Šobrīd nevaram ielādēt muižu sarakstu. Lūdzu, pārlādējiet lapu vai apmeklējiet
                vēlāk.
              </p>
            </>
          )}
        </div>
      ) : outcome.result.items.length === 0 ? (
        filtered ? (
          <div className="directoryStatus">
            <h2>Neviens objekts neatbilst izvēlētajiem filtriem</h2>
            <p>
              {listing.q ? <>Meklējot „{listing.q}”, ar </> : "Ar "}
              šiem filtriem nekas netika atrasts. Objekti, kuriem attiecīgā informācija vēl nav
              reģistrēta, zināmas vērtības atlasē netiek rādīti. Stāvoklim, īpašniekam un dzimtai
              varat izvēlēties arī „Nezināms / nav reģistrēts”.
            </p>
            <p className="directoryStatusActions">
              <Link className="directoryPaginationLink" href={searchOnlyHref}>
                {listing.q ? "Notīrīt filtrus, paturēt meklēšanu" : "Notīrīt filtrus"}
              </Link>
            </p>
          </div>
        ) : listing.q ? (
          <div className="directoryStatus">
            <h2>Nekas netika atrasts</h2>
            <p>
              Pēc „{listing.q}” nav atrasts neviens publicēts objekts. Pārbaudiet rakstību,
              izmēģiniet īsāku vārda daļu vai citu vietas nosaukumu.
            </p>
            <p>
              <Link className="directoryPaginationLink" href={DIRECTORY_PATH}>
                Rādīt visu katalogu
              </Link>
            </p>
          </div>
        ) : (
          <div className="directoryStatus">
            <h2>Pagaidām nav publicētu objektu</h2>
            <p>
              Katalogs tiek papildināts. Drīzumā šeit būs apskatāmas Latvijas muižas un citi
              kultūrvēsturiskie objekti.
            </p>
          </div>
        )
      ) : (
        <>
          <ul className="objectsGrid">
            {outcome.result.items.map((object) => (
              <HeritageObjectCard
                key={object.id}
                object={object}
                directoryContext={directoryContext}
              />
            ))}
          </ul>

          <nav className="directoryPagination" aria-label="Lapas navigācija">
            {outcome.result.hasNextPage && outcome.result.nextCursor ? (
              <Link
                className="directoryPaginationLink"
                href={buildBrowseHref(DIRECTORY_PATH, {
                  ...browse,
                  cursor: encodeCursor(outcome.result.nextCursor),
                })}
              >
                Nākamā lapa
              </Link>
            ) : null}
          </nav>
        </>
      )}
    </>
  );
}
