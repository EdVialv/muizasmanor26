import type { Metadata } from "next";
import Link from "next/link";
import HeritageObjectCard from "@/components/HeritageObjectCard";
import {
  buildNextPageParams,
  cursorMatchesScope,
  decodeCursor,
  type DirectoryCursor,
} from "@/lib/directory/cursor";
import { DIRECTORY_PATH, type DirectoryContext } from "@/lib/directory/links";
import {
  DIRECTORY_PAGE_SIZE,
  DirectoryConfigurationError,
  DirectoryQueryError,
  fetchDirectoryPage,
  type DirectoryPageResult,
} from "@/lib/directory/queries";
import { fetchSearchPage } from "@/lib/directory/search";
import { normalizeSearchQuery, searchScope } from "@/lib/directory/searchQuery";
import { createDirectoryDataSourceFromEnv } from "@/lib/directory/supabaseDataSource";
import { createDirectorySearchDataSourceFromEnv } from "@/lib/directory/supabaseSearchDataSource";

export const metadata: Metadata = {
  title: "Objekti",
  description: "Latvijas muižu un kultūrvēsturisko objektu katalogs.",
};

interface ObjectsPageSearchParams {
  cursor?: string | string[];
  q?: string | string[];
}

type LoadOutcome =
  | { kind: "ok"; result: DirectoryPageResult }
  | { kind: "configuration_error" }
  | { kind: "query_error" };

/**
 * Keeps this Server Component itself async and thin: all pagination, search
 * and query logic lives in src/lib/directory, which the test file exercises
 * by mocking the two data-source factories. Nothing from a failure is
 * returned to the render beyond its kind.
 */
async function loadPage(
  query: string | null,
  cursor: DirectoryCursor | null,
): Promise<LoadOutcome> {
  try {
    const result = query
      ? await fetchSearchPage(
          createDirectorySearchDataSourceFromEnv(),
          query,
          cursor,
          DIRECTORY_PAGE_SIZE,
        )
      : await fetchDirectoryPage(createDirectoryDataSourceFromEnv(), cursor, DIRECTORY_PAGE_SIZE);
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
 * heading and search field (so they survive while results load).
 */
export default async function ObjectsPage({
  searchParams,
}: {
  searchParams: Promise<ObjectsPageSearchParams>;
}) {
  const params = await searchParams;

  const query = normalizeSearchQuery(params.q);
  const scope = query ? searchScope(query) : undefined;

  // A cursor is used only when it decodes AND belongs to this exact listing
  // (this search, or the unfiltered directory). Anything else - malformed,
  // tampered, or carried over from a different search - fails safely to the
  // first page of the current listing, with a notice.
  const rawCursor = typeof params.cursor === "string" ? params.cursor : undefined;
  const decoded = decodeCursor(rawCursor);
  const cursor = decoded && cursorMatchesScope(decoded, scope) ? decoded : null;
  const cursorWasGiven = Array.isArray(params.cursor) || Boolean(params.cursor);
  const cursorWasInvalid = cursorWasGiven && cursor === null;

  const outcome = await loadPage(query, cursor);
  // Cards carry the current search and (validated) cursor, so an object page
  // can link back to this same page of these same results.
  const directoryContext: DirectoryContext = {
    ...(query ? { q: query } : {}),
    ...(cursor && rawCursor ? { cursor: rawCursor } : {}),
  };

  return (
    <>
      {cursorWasInvalid ? (
        <p className="directoryStatusNotice" role="status">
          Saite uz šo lapu bija nederīga — rādīta pirmā lapa.
        </p>
      ) : null}

      {query && outcome.kind === "ok" && outcome.result.items.length > 0 ? (
        <h2 className="directoryResultsHeading">
          Meklēšanas rezultāti: „{query}”{cursor ? " (turpinājums)" : ""}
        </h2>
      ) : null}

      {outcome.kind === "configuration_error" ? (
        <div className="directoryStatus" role="alert">
          <h2>Katalogs nav pieejams</h2>
          <p>Datu pieslēgums šobrīd nav konfigurēts. Lūdzu, apmeklējiet vēlāk.</p>
        </div>
      ) : outcome.kind === "query_error" ? (
        <div className="directoryStatus" role="alert">
          {query ? (
            <>
              <h2>Meklēšana neizdevās</h2>
              <p>
                Šobrīd nevaram izpildīt meklēšanu. Lūdzu, mēģiniet vēlreiz vai apmeklējiet vēlāk.
              </p>
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
        query ? (
          <div className="directoryStatus">
            <h2>Nekas netika atrasts</h2>
            <p>
              Pēc „{query}” nav atrasts neviens publicēts objekts. Pārbaudiet rakstību, izmēģiniet
              īsāku vārda daļu vai citu vietas nosaukumu.
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
                href={{
                  pathname: DIRECTORY_PATH,
                  query: buildNextPageParams(outcome.result.nextCursor, query),
                }}
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
