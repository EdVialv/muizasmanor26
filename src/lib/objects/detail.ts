/**
 * Data access for the Day 14 object page at /objects/[slug]
 * (docs/DAY14_OBJECT_PAGES_NOTES.md).
 *
 * Same split as the Day 13 directory: this file holds the types, the
 * ObjectDetailDataSource seam and the orchestration, with no Supabase
 * import, so it is unit-tested against an in-memory fake. The one module
 * that talks to Supabase is src/lib/objects/supabaseDetailDataSource.ts.
 *
 * Two entry points, deliberately separate:
 *
 *   fetchObjectBySlug     - the object itself. The page awaits this before
 *                           it renders anything, so an unknown slug becomes
 *                           a real HTTP 404 rather than a streamed "not
 *                           found" message under a 200.
 *   fetchObjectRelations  - parent, children and historical owner families.
 *                           Always a fixed number of bounded requests (no
 *                           N+1), fetched in parallel, and streamed into the
 *                           page after the object itself.
 */

export const MAX_RELATED_CHILDREN = 50;
export const MAX_OWNER_FAMILIES = 50;

/**
 * The slug shape scripts/import/rawDatasetTransform.ts's slugify() produces:
 * lowercase ASCII letters and digits in hyphen-separated groups. Anything
 * else cannot be a real slug, so it is rejected before any query is built.
 */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 200;

export function isValidObjectSlug(slug: unknown): slug is string {
  return typeof slug === "string" && slug.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(slug);
}

/** heritage_objects columns the object page reads - a public projection, not `select *`. */
export interface RawObjectDetailRow {
  id: string;
  slug: string;
  name_lv: string;
  object_type: string;
  summary_lv: string | null;
  municipality: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  condition_category: string | null;
  condition_notes_lv: string | null;
  ownership_type: string | null;
  parent_object_id: string | null;
}

export interface RawRelatedObjectRow {
  id: string;
  slug: string;
  name_lv: string;
  object_type: string;
}

export interface RawOwnerFamilyRow {
  family_name: string;
  start_year_approx: number | null;
  end_year_approx: number | null;
}

export interface ObjectDetail {
  id: string;
  slug: string;
  nameLv: string;
  objectType: string;
  summaryLv: string | null;
  municipality: string | null;
  coordinates: { latitude: number; longitude: number } | null;
  conditionCategory: string | null;
  conditionNotesLv: string | null;
  ownershipType: string | null;
  parentObjectId: string | null;
}

export interface RelatedObject {
  id: string;
  slug: string;
  nameLv: string;
  objectType: string;
}

export interface OwnerFamily {
  familyName: string;
  startYearApprox: number | null;
  endYearApprox: number | null;
}

export interface ObjectRelations {
  parent: RelatedObject | null;
  children: RelatedObject[];
  /** True when the object has more published children than MAX_RELATED_CHILDREN. */
  hasMoreChildren: boolean;
  ownerFamilies: OwnerFamily[];
}

export class ObjectDetailQueryError extends Error {
  constructor(
    message: string,
    readonly cause: unknown,
  ) {
    super(message);
    this.name = "ObjectDetailQueryError";
  }
}

/**
 * Every method returns published rows only. The production implementation
 * goes through the anon-key client, so the Day 9 RLS policies enforce that
 * regardless; the explicit filters are defence in depth.
 */
export interface ObjectDetailDataSource {
  fetchPublishedObjectBySlug(slug: string): Promise<RawObjectDetailRow | null>;
  fetchPublishedObjectById(id: string): Promise<RawRelatedObjectRow | null>;
  fetchPublishedChildren(parentId: string, limit: number): Promise<RawRelatedObjectRow[]>;
  fetchVerifiedOwnerFamilies(objectId: string, limit: number): Promise<RawOwnerFamilyRow[]>;
}

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** PostgREST returns `numeric` as a JSON number, but tolerate a numeric string too. */
function toFiniteNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toCoordinates(row: RawObjectDetailRow): ObjectDetail["coordinates"] {
  const latitude = toFiniteNumber(row.latitude);
  const longitude = toFiniteNumber(row.longitude);
  if (latitude === null || longitude === null) {
    return null;
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }
  return { latitude, longitude };
}

function toObjectDetail(row: RawObjectDetailRow): ObjectDetail {
  return {
    id: row.id,
    slug: row.slug,
    nameLv: row.name_lv,
    objectType: row.object_type,
    summaryLv: trimToNull(row.summary_lv),
    municipality: trimToNull(row.municipality),
    coordinates: toCoordinates(row),
    conditionCategory: row.condition_category,
    conditionNotesLv: trimToNull(row.condition_notes_lv),
    ownershipType: row.ownership_type,
    parentObjectId: row.parent_object_id,
  };
}

function toRelatedObject(row: RawRelatedObjectRow): RelatedObject {
  return { id: row.id, slug: row.slug, nameLv: row.name_lv, objectType: row.object_type };
}

/**
 * Returns null - without querying - for a slug that cannot be real, and
 * null when no published object has that slug. Both mean "404".
 */
export async function fetchObjectBySlug(
  dataSource: ObjectDetailDataSource,
  slug: string,
): Promise<ObjectDetail | null> {
  if (!isValidObjectSlug(slug)) {
    return null;
  }

  let row: RawObjectDetailRow | null;
  try {
    row = await dataSource.fetchPublishedObjectBySlug(slug);
  } catch (error) {
    throw new ObjectDetailQueryError("Failed to fetch the object.", error);
  }

  return row ? toObjectDetail(row) : null;
}

/**
 * Parent, children and verified historical owner families for one object:
 * at most three bounded requests, issued in parallel.
 *
 * A parent that is not published is reported as no parent at all - the
 * data source returns null for it (RLS hides the row), and this page must
 * not reveal that an unpublished object exists.
 */
export async function fetchObjectRelations(
  dataSource: ObjectDetailDataSource,
  object: Pick<ObjectDetail, "id" | "parentObjectId">,
): Promise<ObjectRelations> {
  try {
    const [parentRow, childRows, familyRows] = await Promise.all([
      object.parentObjectId
        ? dataSource.fetchPublishedObjectById(object.parentObjectId)
        : Promise.resolve(null),
      dataSource.fetchPublishedChildren(object.id, MAX_RELATED_CHILDREN + 1),
      dataSource.fetchVerifiedOwnerFamilies(object.id, MAX_OWNER_FAMILIES),
    ]);

    const hasMoreChildren = childRows.length > MAX_RELATED_CHILDREN;
    const children = (hasMoreChildren ? childRows.slice(0, MAX_RELATED_CHILDREN) : childRows).map(
      toRelatedObject,
    );

    return {
      parent: parentRow ? toRelatedObject(parentRow) : null,
      children,
      hasMoreChildren,
      ownerFamilies: familyRows
        .map((row) => ({
          familyName: row.family_name.trim(),
          startYearApprox: row.start_year_approx,
          endYearApprox: row.end_year_approx,
        }))
        .filter((family) => family.familyName.length > 0),
    };
  } catch (error) {
    throw new ObjectDetailQueryError("Failed to fetch the object's related records.", error);
  }
}
