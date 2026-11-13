"use client";

import Link from "next/link";
import { DIRECTORY_PATH } from "@/lib/directory/links";

/**
 * Error boundary for exceptions that escape ObjectPage's own handling (it
 * already turns a missing configuration and a failed query into ordinary
 * render states). Like the directory's boundary, it never renders
 * `error.message` or `error.digest`: an unexpected server error must not
 * leak its details into the page.
 */
export default function ObjectError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="objectsSection">
      <div className="container">
        <div className="directoryStatus" role="alert">
          <h1>Neizdevās ielādēt objektu</h1>
          <p>Šobrīd nevaram ielādēt šo objektu. Lūdzu, mēģiniet vēlreiz vai apmeklējiet vēlāk.</p>
          <p className="directoryStatusActions">
            <button type="button" className="directoryPaginationLink" onClick={() => reset()}>
              Mēģināt vēlreiz
            </button>
            <Link className="directoryPaginationLink" href={DIRECTORY_PATH}>
              Atpakaļ uz katalogu
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
