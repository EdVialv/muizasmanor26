// Pure transform/validation logic for the Day 10 importer - no database or
// filesystem access, so this is unit-testable on its own
// (scripts/import/parseSample.test.ts). The CLI orchestration that reads a
// file and talks to Postgres lives in db.ts/runImport.ts instead.

import { createHash } from "node:crypto";
import {
  CONDITION_CATEGORIES,
  OBJECT_TYPES,
  OWNERSHIP_TYPES,
  type CadastreReferenceCandidate,
  type ConditionCategory,
  type HistoricalOwnerFamilyCandidate,
  type ObjectType,
  type OwnershipType,
  type RawSampleRow,
  type StagingCandidate,
} from "./types";

/**
 * docs/DAY6_NORMALIZATION_RULES.md's historical_owner_families column uses a
 * sentinel convention for "no family could be confirmed" - a single
 * parenthetical note, e.g. "(none confirmed -- predates noble-family
 * ownership; associated with the ancient Semigallian/Zemgaļi tribal
 * society)". That note's own internal semicolon is exactly what a naive
 * `split(";")` would misread as two family names, so this sentinel must be
 * recognised and short-circuited before the normal split runs.
 */
const NONE_CONFIRMED_PATTERN = /^\(none confirmed\b/i;

export function parseHistoricalOwnerFamilies(raw: string): HistoricalOwnerFamilyCandidate[] {
  const trimmed = raw.trim();
  if (trimmed === "" || NONE_CONFIRMED_PATTERN.test(trimmed)) {
    return [];
  }

  return trimmed
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
    .map((entry) => ({
      family_name: entry,
      source_url: null,
      // None of this sample's family data has been independently
      // reverified against a primary source - see docs/DAY10_IMPORTER_NOTES.md.
      verification_status: "unverified" as const,
    }));
}

function parseNumberOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

function parseEnumOrNull<T extends string>(raw: string, allowed: readonly T[]): T | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  return (allowed as readonly string[]).includes(trimmed) ? (trimmed as T) : null;
}

function hashRawPayload(raw: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(raw)).digest("hex");
}

export interface BuildStagingCandidateOptions {
  sourceSystem: string;
}

/**
 * Turns one raw CSV row into a staging candidate: resolves/validates every
 * field this importer can resolve, and decides needs_review vs.
 * ready_for_import against heritage_objects' own NOT NULL contract
 * (docs/DATA_MODEL.md "Required fields"). This importer never assigns
 * archived_out_of_scope: every row in this sample is already a type a human
 * researcher selected as in-scope, so there is no raw-blog-text
 * scope/classification decision to automate here (see
 * docs/DAY10_IMPORTER_NOTES.md decision 2).
 */
export function buildStagingCandidate(
  row: RawSampleRow,
  options: BuildStagingCandidateOptions,
): StagingCandidate {
  const sourceSystem = options.sourceSystem;
  // This hand-curated sample has no natural stable source identifier (no
  // "Bloga ieraksta Nr." equivalent - see docs/DAY6_NORMALIZATION_RULES.md
  // section 2, which this importer does not apply here). The slug is
  // already unique and stable within this file, so it is used as
  // external_source_id for this source_system - see
  // docs/DAY10_IMPORTER_NOTES.md decision 1.
  const externalSourceId = row.slug.trim();
  if (externalSourceId === "") {
    throw new Error(
      "cannot stage a sample row without a slug: this import format uses slug as external_source_id",
    );
  }

  const objectType = parseEnumOrNull<ObjectType>(row.object_type, OBJECT_TYPES);
  const objectTypeInvalid = row.object_type.trim() !== "" && objectType === null;

  const conditionCategory = parseEnumOrNull<ConditionCategory>(
    row.condition_category,
    CONDITION_CATEGORIES,
  );
  const conditionCategoryInvalid =
    row.condition_category.trim() !== "" && conditionCategory === null;

  const ownershipType = parseEnumOrNull<OwnershipType>(row.ownership_type, OWNERSHIP_TYPES);
  const ownershipTypeInvalid = row.ownership_type.trim() !== "" && ownershipType === null;

  const nameLv = row.name_lv.trim() || null;
  const slug = row.slug.trim() || null;
  // Never mapped from summary_research_en - see docs/DAY10_IMPORTER_NOTES.md
  // decision 3. summary_lv is a short factual Latvian introduction; the
  // source column is an internal English research note, not publishable
  // text, and no automated translation is performed.
  const summaryLv: string | null = null;
  const municipality = row.municipality.trim() || null;
  const latitude = parseNumberOrNull(row.latitude);
  const longitude = parseNumberOrNull(row.longitude);
  const sourceUrl = row.source_url.trim() || null;
  // Mapped from source_accessed_at - see docs/DAY10_IMPORTER_NOTES.md decision 4.
  const lastVerifiedAt = row.source_accessed_at.trim() || null;
  const parentExternalSourceId = row.parent_object_id.trim() || null;
  const ownershipVerifiedAt: string | null = null;

  const historicalOwnerFamilies = parseHistoricalOwnerFamilies(row.historical_owner_families);

  const cadastreReferences: CadastreReferenceCandidate[] = [];
  const cadastreColumnHasUnparsedValue = row.cadastre_references.trim() !== "";

  const issues: string[] = [];
  if (objectTypeInvalid) issues.push(`invalid object_type "${row.object_type.trim()}"`);
  if (conditionCategoryInvalid)
    issues.push(`invalid condition_category "${row.condition_category.trim()}"`);
  if (ownershipTypeInvalid) issues.push(`invalid ownership_type "${row.ownership_type.trim()}"`);
  if (cadastreColumnHasUnparsedValue) {
    issues.push(
      "cadastre_references column has a value this importer does not parse yet (always empty in this sample; see docs/DAY10_IMPORTER_NOTES.md)",
    );
  }

  const requiredFields: Array<[string, unknown]> = [
    ["name_lv", nameLv],
    ["slug", slug],
    ["summary_lv", summaryLv],
    ["municipality", municipality],
    ["latitude", latitude],
    ["longitude", longitude],
    ["source_url", sourceUrl],
    ["last_verified_at", lastVerifiedAt],
    ["object_type", objectType],
  ];
  const missingRequired = requiredFields
    .filter(([, value]) => value === null)
    .map(([name]) => name);
  if (missingRequired.length > 0) {
    issues.push(`missing required fields: ${missingRequired.join(", ")}`);
  }

  const status = issues.length === 0 ? "ready_for_import" : "needs_review";
  const statusReason = issues.length === 0 ? null : issues.join("; ");

  return {
    source_system: sourceSystem,
    external_source_id: externalSourceId,
    status,
    status_reason: statusReason,
    raw_payload: { ...row },
    raw_payload_hash: hashRawPayload({ ...row }),
    object_type: objectType,
    parent_external_source_id: parentExternalSourceId,
    name_lv: nameLv,
    slug,
    summary_lv: summaryLv,
    municipality,
    latitude,
    longitude,
    source_url: sourceUrl,
    last_verified_at: lastVerifiedAt,
    condition_category: conditionCategory,
    ownership_type: ownershipType,
    ownership_verified_at: ownershipVerifiedAt,
    historical_owner_families: historicalOwnerFamilies,
    cadastre_references: cadastreReferences,
  };
}
