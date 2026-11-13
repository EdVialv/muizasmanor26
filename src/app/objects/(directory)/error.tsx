"use client";

/**
 * Next.js error boundaries must be Client Components. This only catches
 * genuinely unexpected exceptions that escape ObjectsPage's own try/catch
 * (src/app/objects/page.tsx already handles the two known failure modes -
 * missing configuration and a failed query - as ordinary render states).
 * Deliberately never renders `error.message` or `error.digest`: an
 * unexpected server-side error could in principle carry details (a
 * connection string fragment, a stack frame) that must not reach rendered
 * HTML - see docs/DAY13_DIRECTORY_NOTES.md's verification checklist ("no
 * secrets or server error details appear in rendered HTML").
 */
export default function ObjectsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="objectsSection">
      <div className="container">
        <div className="directoryStatus" role="alert">
          <h2>Neizdevās ielādēt sarakstu</h2>
          <p>
            Šobrīd nevaram ielādēt muižu sarakstu. Lūdzu, pārlādējiet lapu vai apmeklējiet vēlāk.
          </p>
          <p>
            <button type="button" className="directoryPaginationLink" onClick={() => reset()}>
              Mēģināt vēlreiz
            </button>
          </p>
        </div>
      </div>
    </section>
  );
}
