import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ObjectAccessSection from "@/components/object/ObjectAccessSection";
import ObjectContactsSection from "@/components/object/ObjectContactsSection";
import { ObjectGallery, ObjectHeroImage } from "@/components/object/ObjectGallery";
import ObjectSourcesSection from "@/components/object/ObjectSourcesSection";
import {
  conditionCategoryLabel,
  objectTypeLabel,
  ownershipTypeLabel,
} from "@/lib/directory/labels";
import { buildDirectoryHref, parseDirectoryContext } from "@/lib/directory/links";
import { formatLatvianDate } from "@/lib/format/dates";
import type { ObjectDetail } from "@/lib/objects/detail";
import { loadObject } from "./loadObject";
import { buildObjectMetadata } from "./objectMetadata";
import ObjectRelationsSection, { ObjectRelationsSkeleton } from "./ObjectRelationsSection";

interface ObjectPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string | string[]; fromQ?: string | string[] }>;
}

export async function generateMetadata({ params }: ObjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const outcome = await loadObject(slug);
  if (outcome.kind === "ok") {
    return buildObjectMetadata(outcome.object);
  }
  if (outcome.kind === "not_found") {
    return { title: "Objekts nav atrasts" };
  }
  return { title: "Objekts" };
}

function formatCoordinates(coordinates: NonNullable<ObjectDetail["coordinates"]>): string {
  return `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`;
}

/** Blank-line-separated text becomes paragraphs; nothing is interpreted as markup. */
function toParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

/**
 * Deliberately has no loading.tsx beside it. A loading boundary would let
 * Next start streaming before the object lookup finishes, and once a
 * response has started its status can no longer change - an unknown slug
 * would then show "not found" under an HTTP 200. Awaiting the lookup here,
 * with no Suspense boundary above it, is what makes notFound() a real 404.
 * The slower, secondary data (related objects, owner families) is what
 * streams, inside the <Suspense> below.
 */
export default async function ObjectPage({ params, searchParams }: ObjectPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const context = parseDirectoryContext(query.from, query.fromQ);
  const directoryHref = buildDirectoryHref(context);

  const outcome = await loadObject(slug);

  if (outcome.kind === "not_found") {
    notFound();
  }

  if (outcome.kind !== "ok") {
    return (
      <section className="objectsSection">
        <div className="container">
          <div className="directoryStatus" role="alert">
            {outcome.kind === "configuration_error" ? (
              <>
                <h1>Objekts nav pieejams</h1>
                <p>Datu pieslēgums šobrīd nav konfigurēts. Lūdzu, apmeklējiet vēlāk.</p>
              </>
            ) : (
              <>
                <h1>Neizdevās ielādēt objektu</h1>
                <p>
                  Šobrīd nevaram ielādēt šo objektu. Lūdzu, pārlādējiet lapu vai apmeklējiet vēlāk.
                </p>
              </>
            )}
            <p>
              <Link className="directoryPaginationLink" href={directoryHref}>
                Atpakaļ uz katalogu
              </Link>
            </p>
          </div>
        </div>
      </section>
    );
  }

  const { object } = outcome;
  const condition = object.conditionCategory
    ? conditionCategoryLabel(object.conditionCategory)
    : null;
  const summaryParagraphs = object.summaryLv ? toParagraphs(object.summaryLv) : [];
  const [heroImage, ...galleryImages] = object.images;
  const ownershipVerified = formatLatvianDate(object.ownershipVerifiedAt);

  return (
    <article className="objectsSection objectDetail">
      <div className="container">
        <nav className="objectBackNav" aria-label="Atgriezties">
          <Link href={directoryHref}>
            <span aria-hidden="true">← </span>Atpakaļ uz katalogu
          </Link>
        </nav>

        <header className="objectDetailHeader">
          <p className="eyebrow">{objectTypeLabel(object.objectType)}</p>
          <h1 className="objectDetailTitle">{object.nameLv}</h1>
          {object.municipality ? (
            <p className="objectDetailLocation">{object.municipality}</p>
          ) : null}
        </header>

        {heroImage ? <ObjectHeroImage image={heroImage} objectName={object.nameLv} /> : null}

        {summaryParagraphs.length > 0 ? (
          <section className="objectSection" aria-labelledby="object-summary">
            <h2 id="object-summary">Apraksts</h2>
            {summaryParagraphs.map((paragraph, index) => (
              <p key={index} className="objectSummaryText">
                {paragraph}
              </p>
            ))}
          </section>
        ) : null}

        <section className="objectSection" aria-labelledby="object-facts">
          <h2 id="object-facts">Pamatinformācija</h2>
          <dl className="objectFacts">
            <div>
              <dt>Veids</dt>
              <dd>{objectTypeLabel(object.objectType)}</dd>
            </div>

            {object.municipality ? (
              <div>
                <dt>Atrašanās vieta</dt>
                <dd>{object.municipality}</dd>
              </div>
            ) : null}

            {object.coordinates ? (
              <div>
                <dt>Koordinātas</dt>
                <dd>{formatCoordinates(object.coordinates)}</dd>
              </div>
            ) : null}

            {condition || object.conditionNotesLv ? (
              <div>
                <dt>Stāvoklis</dt>
                <dd>
                  {condition ? <span>{condition.label}</span> : null}
                  {condition?.note ? <p className="objectFactNote">{condition.note}</p> : null}
                  {object.conditionNotesLv ? (
                    <p className="objectFactNote">{object.conditionNotesLv}</p>
                  ) : null}
                </dd>
              </div>
            ) : null}

            {object.ownershipType ? (
              <div>
                <dt>Īpašuma forma</dt>
                <dd>
                  {ownershipTypeLabel(object.ownershipType)}
                  {ownershipVerified && object.ownershipVerifiedAt ? (
                    <p className="objectFactNote">
                      Pārbaudīts:{" "}
                      <time dateTime={object.ownershipVerifiedAt}>{ownershipVerified}</time>
                    </p>
                  ) : null}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>

        <ObjectAccessSection object={object} />

        <ObjectGallery
          images={galleryImages}
          objectName={object.nameLv}
          hasMore={object.hasMoreImages}
        />

        <ObjectContactsSection contacts={object.contacts} />

        <ObjectSourcesSection object={object} />

        <Suspense fallback={<ObjectRelationsSkeleton />}>
          <ObjectRelationsSection
            object={{ id: object.id, parentObjectId: object.parentObjectId }}
            context={context}
          />
        </Suspense>
      </div>
    </article>
  );
}
