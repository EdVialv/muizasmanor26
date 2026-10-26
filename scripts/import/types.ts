// Shared types for the Day 10 importer. See docs/DAY10_IMPORTER_NOTES.md for
// the design decisions behind this shape.

export const OBJECT_TYPES = [
  "manor_estate",
  "manor_house",
  "palace_or_castle",
  "park_or_garden",
  "ruin_or_historical_site",
  "outbuilding",
  "other_heritage_object",
] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];

export const CONDITION_CATEGORIES = ["historical_site", "damaged", "class_b", "class_a"] as const;
export type ConditionCategory = (typeof CONDITION_CATEGORIES)[number];

export const OWNERSHIP_TYPES = [
  "private_person",
  "private_legal_entity",
  "municipality",
  "state",
] as const;
export type OwnershipType = (typeof OWNERSHIP_TYPES)[number];

export const IMPORT_ROW_STATUSES = [
  "archived_out_of_scope",
  "needs_review",
  "ready_for_import",
  "imported",
] as const;
export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number];

/** One row of data/sample/day4-representative-records.csv, as csv-parse gives it (every value a string). */
export interface RawSampleRow {
  object_type: string;
  parent_object_id: string;
  name_lv: string;
  slug: string;
  summary_research_en: string;
  municipality: string;
  latitude: string;
  longitude: string;
  condition_category: string;
  ownership_type: string;
  cadastre_references: string;
  cadastre_verified_at: string;
  cadastre_source_url: string;
  historical_owner_families: string;
  source_url: string;
  source_accessed_at: string;
  notes: string;
}

export interface HistoricalOwnerFamilyCandidate {
  family_name: string;
  source_url: string | null;
  verification_status: "unverified" | "verified";
}

export interface CadastreReferenceCandidate {
  reference_type: string;
  reference_value: string;
  match_method: string;
  source_url: string | null;
}

/** The row this importer stages into staging_heritage_objects, before promotion. */
export interface StagingCandidate {
  source_system: string;
  external_source_id: string;
  status: ImportRowStatus;
  status_reason: string | null;
  raw_payload: Record<string, unknown>;
  raw_payload_hash: string;
  object_type: ObjectType | null;
  parent_external_source_id: string | null;
  name_lv: string | null;
  slug: string | null;
  summary_lv: string | null;
  municipality: string | null;
  latitude: number | null;
  longitude: number | null;
  source_url: string | null;
  last_verified_at: string | null;
  condition_category: ConditionCategory | null;
  ownership_type: OwnershipType | null;
  ownership_verified_at: string | null;
  historical_owner_families: HistoricalOwnerFamilyCandidate[];
  cadastre_references: CadastreReferenceCandidate[];
}

export interface ImportSummary {
  sourceSystem: string;
  file: string;
  totalRows: number;
  staged: number;
  skippedUnchanged: number;
  byStatus: Record<ImportRowStatus, number>;
  promoted: number;
  deferredOnParent: number;
  rows: Array<{
    externalSourceId: string;
    status: ImportRowStatus;
    statusReason: string | null;
    promotedObjectId: string | null;
  }>;
}
