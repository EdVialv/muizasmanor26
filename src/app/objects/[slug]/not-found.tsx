import Link from "next/link";
import { DIRECTORY_PATH } from "@/lib/directory/links";

/**
 * Rendered (with an HTTP 404) when ObjectPage calls notFound(): the slug is
 * malformed, or no published object has it. The two cases look identical on
 * purpose - this page must not reveal whether an unpublished object exists.
 */
export default function ObjectNotFound() {
  return (
    <section className="objectsSection">
      <div className="container">
        <div className="directoryStatus">
          <h1>Objekts nav atrasts</h1>
          <p>Šāda objekta katalogā nav, vai arī tas vēl nav publicēts.</p>
          <p>
            <Link className="directoryPaginationLink" href={DIRECTORY_PATH}>
              Atpakaļ uz katalogu
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
