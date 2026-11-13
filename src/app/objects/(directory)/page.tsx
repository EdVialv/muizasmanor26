import type { Metadata } from "next";
import Link from "next/link";
import HeritageObjectCard from "@/components/HeritageObjectCard";
import { buildNextPageParams, decodeCursor } from "@/lib/directory/cursor";
import type { DirectoryContext } from "@/lib/directory/links";
import {
  DIRECTORY_PAGE_SIZE,
  DirectoryConfigurationError,
  DirectoryQueryError,
  fetchDirectoryPage,
  type DirectoryPageResult,
} from "@/lib/directory/queries";
import { createDirectoryDataSourceFromEnv } from "@/lib/directory/supabaseDataSource";

export const metadata: Metadata = {
  title: "Objekti",
  description: "Latvijas muižu un kultūrvēsturisko objektu katalogs.",
};

interface ObjectsPageSearchParams {
  cursor?: string;
}

/**
 * Keeps this Server Component itself async and thin: all pagination/query
 * logic lives in src/lib/directory, which is what the test file exercises
 * directly by injecting a fake DirectoryDataSource. This function is the
 * one seam that actually talks to Supabase, isolated so a test can mock the
 * "@/lib/directory/supabaseDataSource" module instead of needing real
 * environment variables (docs/DAY13_DIRECTORY_NOTES.md).
 */
async function loadPage(
  cursor: ReturnType<typeof decodeCursor>,
): Promise<
  | { kind: "ok"; result: DirectoryPageResult }
  | { kind: "configuration_error" }
  | { kind: "query_error" }
> {
  try {
    const dataSource = createDirectoryDataSourceFromEnv();
    const result = await fetchDirectoryPage(dataSource, cursor, DIRECTORY_PAGE_SIZE);
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

export default async function ObjectsPage({
  searchParams,
}: {
  searchParams: Promise<ObjectsPageSearchParams>;
}) {
  const params = await searchParams;

  const rawCursor = params.cursor;
  const decodedCursor = decodeCursor(rawCursor);
  const cursorWasInvalid = Boolean(rawCursor) && decodedCursor === null;
  // An invalid cursor fails safely to "no cursor" (the first page) rather
  // than reaching the query or throwing - see src/lib/directory/cursor.ts.
  const outcome = await loadPage(decodedCursor);
  // Cards carry the current (validated) cursor so an object page can link
  // back to this same page of the directory - see src/lib/directory/links.ts.
  const directoryContext: DirectoryContext =
    decodedCursor && rawCursor ? { cursor: rawCursor } : {};

  return (
    <section className="objectsSection">
      <div className="container">
        <h1 className="objectsHeading">Muižu un kultūrvēsturisko objektu katalogs</h1>

        {cursorWasInvalid ? (
          <p className="directoryStatusNotice" role="status">
            Saite uz šo lapu bija nederīga — rādīta pirmā lapa.
          </p>
        ) : null}

        {outcome.kind === "configuration_error" ? (
          <div className="directoryStatus" role="alert">
            <h2>Katalogs nav pieejams</h2>
            <p>Datu pieslēgums šobrīd nav konfigurēts. Lūdzu, apmeklējiet vēlāk.</p>
          </div>
        ) : outcome.kind === "query_error" ? (
          <div className="directoryStatus" role="alert">
            <h2>Neizdevās ielādēt sarakstu</h2>
            <p>
              Šobrīd nevaram ielādēt muižu sarakstu. Lūdzu, pārlādējiet lapu vai apmeklējiet vēlāk.
            </p>
          </div>
        ) : outcome.result.items.length === 0 ? (
          <div className="directoryStatus">
            <h2>Pagaidām nav publicētu objektu</h2>
            <p>
              Katalogs tiek papildināts. Drīzumā šeit būs apskatāmas Latvijas muižas un citi
              kultūrvēsturiskie objekti.
            </p>
          </div>
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
                    pathname: "/objects",
                    query: buildNextPageParams(outcome.result.nextCursor),
                  }}
                >
                  Nākamā lapa
                </Link>
              ) : null}
            </nav>
          </>
        )}
      </div>
    </section>
  );
}
