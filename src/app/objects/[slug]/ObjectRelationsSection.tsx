import Link from "next/link";
import { objectTypeLabel } from "@/lib/directory/labels";
import { buildObjectHref, type DirectoryContext } from "@/lib/directory/links";
import {
  fetchObjectRelations,
  MAX_RELATED_CHILDREN,
  type ObjectDetail,
  type ObjectRelations,
  type OwnerFamily,
  type RelatedObject,
} from "@/lib/objects/detail";
import { createObjectDetailDataSourceFromEnv } from "@/lib/objects/supabaseDetailDataSource";

/**
 * "ap" marks the years as approximate: the columns are start_year_approx /
 * end_year_approx, and the page must not present them as exact dates.
 */
export function formatOwnerFamilyPeriod(family: OwnerFamily): string | null {
  const { startYearApprox: start, endYearApprox: end } = family;
  if (start !== null && end !== null) {
    return `ap ${start}–${end}`;
  }
  if (start !== null) {
    return `no ap ${start}`;
  }
  if (end !== null) {
    return `līdz ap ${end}`;
  }
  return null;
}

function RelatedObjectLink({
  object,
  context,
}: {
  object: RelatedObject;
  context: DirectoryContext;
}) {
  return (
    <>
      <Link href={buildObjectHref(object.slug, context)}>{object.nameLv}</Link>
      <span className="objectRelatedType">{objectTypeLabel(object.objectType)}</span>
    </>
  );
}

/** The presentational half, separated so it can be rendered directly in tests. */
export function ObjectRelationsView({
  relations,
  context,
}: {
  relations: ObjectRelations;
  context: DirectoryContext;
}) {
  const { parent, children, hasMoreChildren, ownerFamilies } = relations;
  const hasRelatedObjects = parent !== null || children.length > 0;

  if (!hasRelatedObjects && ownerFamilies.length === 0) {
    return null;
  }

  return (
    <>
      {ownerFamilies.length > 0 ? (
        <section className="objectSection" aria-labelledby="object-owner-families">
          <h2 id="object-owner-families">Vēsturiskie īpašnieki</h2>
          <ul className="objectPlainList">
            {ownerFamilies.map((family) => {
              const period = formatOwnerFamilyPeriod(family);
              return (
                <li key={`${family.familyName}-${family.startYearApprox ?? ""}`}>
                  {family.familyName}
                  {period ? <span className="objectRelatedType">{period}</span> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {hasRelatedObjects ? (
        <section className="objectSection" aria-labelledby="object-related">
          <h2 id="object-related">Saistītie objekti</h2>

          {parent ? (
            <div className="objectRelatedGroup">
              <h3>Ietilpst kompleksā</h3>
              <ul className="objectPlainList">
                <li>
                  <RelatedObjectLink object={parent} context={context} />
                </li>
              </ul>
            </div>
          ) : null}

          {children.length > 0 ? (
            <div className="objectRelatedGroup">
              <h3>Šim objektam piederīgie objekti</h3>
              <ul className="objectPlainList">
                {children.map((child) => (
                  <li key={child.id}>
                    <RelatedObjectLink object={child} context={context} />
                  </li>
                ))}
              </ul>
              {hasMoreChildren ? (
                <p className="objectSectionNote">Rādīti pirmie {MAX_RELATED_CHILDREN} objekti.</p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

/**
 * Async Server Component: fetches the object's parent, children and
 * historical owner families and renders them. The page wraps it in
 * <Suspense>, so the object's own facts are on screen while this streams in.
 *
 * A failure here is contained: it shows a short notice in place of the
 * related sections instead of taking down an object page whose main content
 * loaded fine. Nothing from the underlying error is rendered.
 */
export default async function ObjectRelationsSection({
  object,
  context,
}: {
  object: Pick<ObjectDetail, "id" | "parentObjectId">;
  context: DirectoryContext;
}) {
  let relations: ObjectRelations;
  try {
    relations = await fetchObjectRelations(createObjectDetailDataSourceFromEnv(), object);
  } catch (error) {
    console.error("[objects/slug] related records failed to load:", error);
    return (
      <p className="directoryStatusNotice" role="status">
        Saistītos objektus un vēsturiskos īpašniekus šobrīd neizdevās ielādēt.
      </p>
    );
  }

  return <ObjectRelationsView relations={relations} context={context} />;
}

export function ObjectRelationsSkeleton() {
  return (
    <p className="directoryStatusNotice" role="status">
      Ielādē saistītos objektus…
    </p>
  );
}
