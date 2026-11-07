// Shared types for the Day 11 dry run against the real raw blog dataset
// (manasvietas.blogspot.com export, "muizasdb_pic.xlsx"). See
// docs/DAY11_DRY_RUN_NOTES.md and docs/DAY6_NORMALIZATION_RULES.md for the
// rules this implements. This is read-only analysis: nothing here writes to
// any database, and the dry-run CLI (day11DryRun.ts) never imports db.ts.

/** One image row from the raw workbook, exactly as exported (one row per image). */
export interface RawBlogImageRow {
  sourceRowNumber: number | null; // "Nr." - ordering metadata only, never identity
  postId: string; // "Bloga ieraksta Nr." - the permanent, owner-confirmed post identity
  title: string; // "Bloga posta nosaukums"
  postUrl: string; // "Bloga ieraksta adrese (URL)"
  driveFilename: string; // "Attēla nosaukums Drive"
  driveUrl: string; // "Hipersaite Google Drive"
  originalImageUrl: string; // "Attēla oriģinālā saite blogā"
  address: string; // "Adrese"
  coordinates: string; // "Koordinātas"
  caption: string; // "Attēla paraksts"
  bodyText: string; // "Posta sekojošais teksts"
}

export const SCOPE_KEYWORD_GROUPS = [
  "manor",
  "palace_or_castle_or_hillfort",
  "ruin",
  "church",
  "mill",
  "school",
  "cemetery",
  "station",
  "bridge",
] as const;
export type ScopeKeywordGroup = (typeof SCOPE_KEYWORD_GROUPS)[number];

/** In-scope per docs/DAY6_NORMALIZATION_RULES.md section 1. */
export const IN_SCOPE_KEYWORD_GROUPS: readonly ScopeKeywordGroup[] = [
  "manor",
  "palace_or_castle_or_hillfort",
  "ruin",
];

/**
 * The raw, title-only keyword signal (section 1's "triage aid"). Kept
 * around for audit/comparison even after the confirmation pass below runs.
 */
export type ScopeTriage =
  "in_scope_candidate" | "out_of_scope_candidate" | "ambiguous_no_keyword_match";

/**
 * What the Day 11 scope-confirmation pass actually based its decision on,
 * for every post: the title alone named a manor/palace/castle/hillfort; the
 * title didn't, but the post's own body text used an explicit
 * manor-complex-membership phrase (section 1's "even when its title alone
 * would not suggest a manor"); or neither did - no textual signal anywhere.
 */
export type ScopeDecisionBasis =
  "title_keyword" | "body_text_affiliation_phrase" | "no_signal_found";

/**
 * The confirmed, two-state scope decision for this dataset's v1 import
 * (docs/DAY6_NORMALIZATION_RULES.md section 1). "archived_out_of_scope" is
 * a real decision, not a placeholder - but it is always reversible: the
 * post stays archived with its stable identity, never deleted, and section
 * 1 itself frames this as "a product decision, not a permanent one."
 */
export type ScopeDecision = "in_scope" | "archived_out_of_scope";

export interface ParsedImage {
  sourceRowNumber: number | null;
  externalImageId: string;
  externalImageIdSource: "drive_file_id" | "original_url" | "content_hash";
  driveFilename: string | null;
  driveUrl: string | null;
  originalImageUrl: string | null;
  caption: string | null;
}

export interface PrimaryNameResult {
  primaryName: string;
  alternateNames: string[];
  locationHint: string | null;
  ambiguousParentheses: boolean;
}

export interface CollapsedPost {
  sourceSystem: string;
  externalSourceId: string; // Bloga ieraksta Nr.
  title: string;
  postUrl: string | null;

  primaryName: string;
  alternateNames: string[];
  locationHint: string | null;
  ambiguousParentheses: boolean;
  slug: string;

  address: string | null;
  addressVariantCount: number;
  coordinates: { latitude: number; longitude: number } | null;
  coordinatesVariantCount: number;
  coordinatesUnparsed: string | null; // non-placeholder text present but not parseable as "lat, lng"
  coordinatesOutsideLatviaBbox: boolean;

  bodyText: string | null;
  bodyTextVariantCount: number;

  images: ParsedImage[];

  matchedKeywordGroups: ScopeKeywordGroup[];
  scopeTriage: ScopeTriage;
  bodyTextAffiliationPhraseMatched: string | null;
  scopeDecision: ScopeDecision;
  scopeDecisionBasis: ScopeDecisionBasis;

  issues: string[];
  proposedStatus: "needs_review" | "archived_out_of_scope";
  proposedStatusPendingConfirmation: boolean;
}

export interface DuplicateCandidate {
  kind: "name_match" | "near_identical_coordinates";
  postA: string;
  postB: string;
  detail: string;
}

export interface RelationshipCandidate {
  postA: string;
  postB: string;
  distanceMeters: number;
}

export interface DryRunReport {
  sourceFile: string;
  sourceFileSha256: string;
  sourceFileSizeBytes: number;
  generatedAt: string;
  totalImageRows: number;
  totalPosts: number;
  scopeCounts: Record<ScopeTriage, number>;
  scopeDecisionCounts: Record<ScopeDecision, number>;
  scopeDecisionBasisCounts: Record<ScopeDecisionBasis, number>;
  proposedStatusCounts: Record<"needs_review" | "archived_out_of_scope", number>;
  issueFrequency: Record<string, number>;
  missingCoordinatesCount: number;
  missingAddressCount: number;
  coordinatesOutsideBboxCount: number;
  coordinatesUnparsedCount: number;
  withinPostVariantCounts: {
    address: number;
    coordinates: number;
    bodyText: number;
  };
  duplicateCandidates: DuplicateCandidate[];
  relationshipCandidates: RelationshipCandidate[];
  slugCollisionGroups: number;
  sampleIssues: Array<{ externalSourceId: string; title: string; issues: string[] }>;
  bodyTextReclassifiedSample: Array<{ externalSourceId: string; title: string; phrase: string }>;
  /**
   * How every per-image identity was actually sourced (section 6):
   * drive_file_id (preferred), original_url (fallback) or content_hash
   * (last resort, when neither is usable). Added per a Day 11 Codex review
   * finding - fixing the hyperlink-extraction bug (decision 11) changes
   * these counts materially, since drive_file_id extraction previously ran
   * against each hyperlink cell's *displayed text* instead of its actual
   * target URL.
   */
  imageIdentitySourceCounts: Record<ParsedImage["externalImageIdSource"], number>;
}
