// Pure transform/validation logic for the Day 11 dry run against the real
// raw blog dataset. No database or filesystem access here - everything is
// unit-testable (rawDatasetTransform.test.ts). The xlsx-reading CLI lives in
// day11DryRun.ts. See docs/DAY11_DRY_RUN_NOTES.md for the decisions behind
// this shape and docs/DAY6_NORMALIZATION_RULES.md for the rules themselves.

import { createHash } from "node:crypto";
import {
  IN_SCOPE_KEYWORD_GROUPS,
  type CollapsedPost,
  type ParsedImage,
  type PrimaryNameResult,
  type RawBlogImageRow,
  type ScopeDecision,
  type ScopeDecisionBasis,
  type ScopeKeywordGroup,
  type ScopeTriage,
} from "./rawDatasetTypes";

// --- Placeholder detection (docs/DAY5_COLUMN_MAPPING.md "Null-handling") ---

const ADDRESS_PLACEHOLDER = /^adrese nav atrasta$/i;
const COORDINATES_PLACEHOLDER = /^koordinātas nav atrastas$/i;
const BODY_TEXT_PLACEHOLDER_HINT = /nav atrast/i;

// --- Section 1: title-keyword scope triage (a triage aid only, never final) ---

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}]+/gu) ?? [];
}

/**
 * Reproduces docs/DAY5_COLUMN_MAPPING.md's keyword-group scan, matched on
 * whole words (via Unicode letter-run tokenising) so place names like
 * Ventspils, Jēkabpils and Mālpils are never counted as "pils" - the same
 * word-boundary fix Day 5 already applied.
 */
export function scanKeywordGroups(title: string): ScopeKeywordGroup[] {
  const groups = new Set<ScopeKeywordGroup>();
  for (const word of words(title)) {
    if (word.startsWith("muiž")) groups.add("manor");
    else if (word === "pils" || word === "pilsdrupas" || word === "pilskalns") {
      groups.add("palace_or_castle_or_hillfort");
    } else if (word.startsWith("drupas") || word.startsWith("ruin")) groups.add("ruin");
    else if (word.startsWith("baznīc") || word === "dievnams" || word.startsWith("katedrāl")) {
      groups.add("church");
    } else if (word.startsWith("dzirnav")) groups.add("mill");
    else if (word.startsWith("skol")) groups.add("school");
    else if (word === "kapi" || word.startsWith("kapsēt") || word.startsWith("apbedīj")) {
      groups.add("cemetery");
    } else if (word.startsWith("stacij")) groups.add("station");
    else if (word === "tilts") groups.add("bridge");
  }
  return [...groups];
}

export function classifyScope(matchedGroups: ScopeKeywordGroup[]): ScopeTriage {
  const hasInScope = matchedGroups.some((g) => IN_SCOPE_KEYWORD_GROUPS.includes(g));
  if (hasInScope) return "in_scope_candidate";
  if (matchedGroups.length > 0) return "out_of_scope_candidate";
  return "ambiguous_no_keyword_match";
}

/**
 * Day 11 scope-confirmation pass (docs/DAY6_NORMALIZATION_RULES.md section
 * 1's own "even when its title alone would not suggest a manor" clause):
 * phrases that say a structure explicitly belongs to, or sits within, a
 * manor's own grounds or complex - not just that a manor is mentioned
 * nearby. Deliberately tighter than a bare "muiž*"/"pils" substring match,
 * which would also fire on text like "south of the manor" that describes
 * proximity, not membership. See docs/DAY11_DRY_RUN_NOTES.md decision 10
 * for why this is a real decision rule, not a guess, and what it cannot
 * catch (anything that would need the blog post's own photos or full
 * context to resolve).
 */
// NOTE: these use [\p{L}]* rather than \w* for the "rest of the word"
// stretches. \w in JS only matches ASCII word characters even with the `u`
// flag, so it cannot span a Latvian diacritic (ā/č/ē/ģ/ī/ķ/ļ/ņ/š/ū/ž) that
// falls after the pattern's ASCII literal prefix - e.g. "bijuš\w*" cannot
// consume the "ā" in "bijušās", so "bijuš\w*\s+muiž..." would silently fail
// to match "bijušās muižas". [\p{L}]* matches any Unicode letter instead.
const MANOR_AFFILIATION_PHRASE_PATTERNS: RegExp[] = [
  // "muižas komplekss / ansamblis / teritorijā / parkā / klēts / kūts /
  // stallis / dzirnavas / kapela / skola / pārvaldnieka māja / saimniecības ēka"
  /muiž[\p{L}]*\s+(komplekss[\p{L}]*|ansambl[\p{L}]*|teritorij[\p{L}]*|park[\p{L}]*|klēt[\p{L}]*|kūt[\p{L}]*|stall[\p{L}]*|dzirnav[\p{L}]*|kapel[\p{L}]*|skol[\p{L}]*|pārvaldniek[\p{L}]*|saimniecīb[\p{L}]*)/iu,
  // "piederēja/piederējusi muižai" (belonged to the manor)
  /piederēj[\p{L}]*\s+muiž[\p{L}]*/iu,
  // "bijušās muižas <noun>" (the former manor's <noun>)
  /bijuš[\p{L}]*\s+muiž[\p{L}]*/iu,
  // "muižas pils" / "pils muižas" - an estate's own palace/castle building.
  // "pils" must be a complete word here (lookaround, not \b+[\p{L}]*): a
  // bare \b boundary plus [\p{L}]* would let "pils" swallow the rest of an
  // unrelated word, e.g. matching "Pilskalnes muižnieks" as if "Pilskalnes"
  // were "pils" + "kalnes" - the exact toponym false-positive the
  // word-boundary-safe scanKeywordGroups above was already built to avoid.
  /muiž[\p{L}]*\s+pils(?![\p{L}])/iu,
  /(?<![\p{L}])pils(?![\p{L}])\s+muiž[\p{L}]*/iu,
];

/**
 * Returns the first matched manor-affiliation phrase in the body text, or
 * null if none is present. Null does not mean "definitely out of scope" -
 * it means this pass found no textual signal either way.
 */
export function findManorAffiliationPhrase(bodyText: string): string | null {
  for (const pattern of MANOR_AFFILIATION_PHRASE_PATTERNS) {
    const match = bodyText.match(pattern);
    if (match) return match[0];
  }
  return null;
}

export interface ScopeDecisionResult {
  decision: ScopeDecision;
  basis: ScopeDecisionBasis;
  bodyTextAffiliationPhraseMatched: string | null;
}

/**
 * The actual Day 11 scope decision: in scope if the title names a manor/
 * palace/castle/hillfort (the already-established, naming-convention-based
 * title rule), OR if it doesn't but the body text uses an explicit
 * manor-complex-membership phrase; archived_out_of_scope otherwise. This
 * collapses the three-way title-only triage into the two-state decision
 * the import contract actually needs, while keeping a full audit trail
 * (scopeTriage/matchedKeywordGroups alongside this) of how it was reached.
 */
export function decideScopeConfirmed(
  titleScopeTriage: ScopeTriage,
  bodyText: string | null,
): ScopeDecisionResult {
  if (titleScopeTriage === "in_scope_candidate") {
    return { decision: "in_scope", basis: "title_keyword", bodyTextAffiliationPhraseMatched: null };
  }
  const phrase = bodyText ? findManorAffiliationPhrase(bodyText) : null;
  if (phrase) {
    return {
      decision: "in_scope",
      basis: "body_text_affiliation_phrase",
      bodyTextAffiliationPhraseMatched: phrase,
    };
  }
  return {
    decision: "archived_out_of_scope",
    basis: "no_signal_found",
    bodyTextAffiliationPhraseMatched: null,
  };
}

// --- Section 2: primary-name extraction and slug generation ---

/**
 * Looks for the first "(" and classifies what follows it, distinguishing
 * "no parenthetical group at all" from "one was opened but never closed" -
 * the previous implementation collapsed both cases to the same `null`
 * result, which is why an unbalanced group used to silently fall through
 * to the same (non-ambiguous) branch as an ordinary title with no
 * parentheses at all (a Codex review finding on Day 11; see
 * docs/DAY11_DRY_RUN_NOTES.md decision 11).
 */
type ParenGroupResult =
  { kind: "none" } | { kind: "unbalanced" } | { kind: "found"; start: number; end: number };

function firstParenGroup(title: string): ParenGroupResult {
  const start = title.indexOf("(");
  if (start === -1) return { kind: "none" };
  let depth = 0;
  for (let i = start; i < title.length; i += 1) {
    if (title[i] === "(") depth += 1;
    else if (title[i] === ")") {
      depth -= 1;
      if (depth === 0) return { kind: "found", start, end: i };
    }
  }
  return { kind: "unbalanced" };
}

/**
 * docs/DAY6_NORMALIZATION_RULES.md section 2: "When a title has a
 * non-empty prefix followed by a complete first parenthetical group, use
 * the trimmed prefix as the primary-name candidate ... If the parentheses
 * are missing, unbalanced or ambiguous, retain the full title as the
 * candidate and queue it for review."
 *
 * That sentence reads as one rule covering three sub-cases, but section 2's
 * own worked-example table immediately contradicts a literal reading for
 * the "missing" case: it lists a title with no parenthetical group at all
 * ("Dzelzceļa tilts pie bijušās stacijas...") as a perfectly ordinary
 * example - not flagged, not distinguished from the manor titles next to
 * it. A title simply not using the "(alternates) location" convention is
 * the common, unremarkable case (Day 5 found the majority of titles have
 * no parenthetical group at all); flagging all of them for manual review
 * would bury the two cases that actually need it in noise.
 *
 * This implementation resolves that by only setting `ambiguousParentheses`
 * when the title's own parenthetical syntax is genuinely malformed or
 * unusable - an opened-but-never-closed group, or a group that starts the
 * title and leaves no non-empty prefix - never for the ordinary absence of
 * parentheses. See docs/DAY11_DRY_RUN_NOTES.md decision 11 for the full
 * writeup of this decision, flagged for Codex/owner review in case the
 * stricter literal reading was actually intended.
 */
export function extractPrimaryName(title: string): PrimaryNameResult {
  const trimmedTitle = title.trim();
  const group = firstParenGroup(trimmedTitle);

  if (group.kind === "none") {
    return {
      primaryName: trimmedTitle,
      alternateNames: [],
      locationHint: null,
      ambiguousParentheses: false,
    };
  }

  if (group.kind === "unbalanced") {
    return {
      primaryName: trimmedTitle,
      alternateNames: [],
      locationHint: null,
      ambiguousParentheses: true,
    };
  }

  if (group.start === 0) {
    // The group starts the title, so there is no non-empty prefix to use.
    return {
      primaryName: trimmedTitle,
      alternateNames: [],
      locationHint: null,
      ambiguousParentheses: true,
    };
  }

  const prefix = trimmedTitle.slice(0, group.start).trim();
  const inside = trimmedTitle.slice(group.start + 1, group.end);
  const after = trimmedTitle.slice(group.end + 1).trim();

  if (prefix === "") {
    return {
      primaryName: trimmedTitle,
      alternateNames: [],
      locationHint: null,
      ambiguousParentheses: true,
    };
  }

  const alternateNames = inside
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");

  return {
    primaryName: prefix,
    alternateNames,
    locationHint: after === "" ? null : after,
    ambiguousParentheses: false,
  };
}

const DIACRITIC_MAP: Record<string, string> = {
  ā: "a",
  č: "c",
  ē: "e",
  ģ: "g",
  ī: "i",
  ķ: "k",
  ļ: "l",
  ņ: "n",
  š: "s",
  ū: "u",
  ž: "z",
};

export function transliterate(text: string): string {
  return text
    .toLowerCase()
    .split("")
    .map((ch) => DIACRITIC_MAP[ch] ?? ch)
    .join("");
}

export function slugify(text: string): string {
  return transliterate(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface SlugInput {
  externalSourceId: string;
  primaryName: string;
  locationHint: string | null;
}

/**
 * Deterministic slug collision resolution (docs/DAY6_NORMALIZATION_RULES.md
 * section 2): base slug wins when unique; colliding members append their
 * slugified location hint when available, falling back to the permanent
 * external_source_id. Input order does not affect the result, so batching
 * and resumed runs produce the same slugs.
 *
 * A Day 11 Codex review finding: the previous implementation only checked
 * a collision-derived slug (base + location hint, or base + external id)
 * against OTHER collision-derived slugs assigned so far - never against an
 * unrelated record's own unique base slug. That let two different records
 * end up with the identical final slug, e.g. "Foo" with location hint
 * "Bar" deriving "foo-bar" while a separate, unrelated "Foo Bar" record's
 * own (unique, un-collided) base slug is also literally "foo-bar". This
 * implementation fixes that by reserving every unique base slug globally,
 * up front, before any collision-derived candidate is considered - so a
 * derived slug can never collide with another record's base slug, another
 * collision group's derived slug, or (via a last-resort incrementing
 * counter) even a pathological case where both of its own normal
 * candidates are already taken. See docs/DAY11_DRY_RUN_NOTES.md decision
 * 11 for the full writeup and a worked example.
 */
export function resolveSlugCollisions(inputs: SlugInput[]): Map<string, string> {
  const sorted = [...inputs].sort((a, b) => a.externalSourceId.localeCompare(b.externalSourceId));
  const baseSlugs = new Map(sorted.map((i) => [i.externalSourceId, slugify(i.primaryName)]));

  const countsByBase = new Map<string, number>();
  for (const base of baseSlugs.values()) {
    countsByBase.set(base, (countsByBase.get(base) ?? 0) + 1);
  }

  // Every base slug that is unique on its own is a guaranteed final slug,
  // independent of input order (it only depends on counting identical base
  // strings, never on processing order) - reserve all of them globally
  // before resolving any collision group, so a collision-derived candidate
  // can never be handed out to a different record that already owns it.
  const reserved = new Set<string>();
  for (const [base, count] of countsByBase) {
    if (count === 1) reserved.add(base);
  }

  const result = new Map<string, string>();

  for (const input of sorted) {
    const base = baseSlugs.get(input.externalSourceId)!;

    if ((countsByBase.get(base) ?? 0) === 1) {
      result.set(input.externalSourceId, base);
      continue;
    }

    const hintSlug = input.locationHint ? slugify(input.locationHint) : "";
    const candidates = [
      hintSlug !== "" ? `${base}-${hintSlug}` : null,
      `${base}-${input.externalSourceId}`,
    ].filter((candidate): candidate is string => candidate !== null);

    let finalSlug = candidates.find((candidate) => !reserved.has(candidate));

    if (!finalSlug) {
      // Last-resort safety net: both normal candidates are already taken
      // (e.g. by another record's reserved unique base slug). Append an
      // increasing counter - starting at 2, since the id-suffixed form is
      // conceptually "variant 1" - until a genuinely free slug is found.
      // This should essentially never trigger on real data; it exists so
      // every final slug is provably globally unique no matter what.
      let suffix = 2;
      let candidate = `${base}-${input.externalSourceId}-${suffix}`;
      while (reserved.has(candidate)) {
        suffix += 1;
        candidate = `${base}-${input.externalSourceId}-${suffix}`;
      }
      finalSlug = candidate;
    }

    reserved.add(finalSlug);
    result.set(input.externalSourceId, finalSlug);
  }

  return result;
}

// --- Section 3: row-collapse precedence ---

/** Approximate Latvia bounding box, per docs/DAY5_COLUMN_MAPPING.md. */
export const LATVIA_BBOX = { minLat: 55.0, maxLat: 58.5, minLon: 19.5, maxLon: 29.0 };

export interface ParsedCoordinates {
  value: { latitude: number; longitude: number } | null;
  /** Set when the text is present, non-placeholder, but not a parseable "lat, lng" pair. */
  unparsedText: string | null;
}

export function parseCoordinates(raw: string): ParsedCoordinates {
  const trimmed = raw.trim();
  if (trimmed === "" || COORDINATES_PLACEHOLDER.test(trimmed)) {
    return { value: null, unparsedText: null };
  }
  const parts = trimmed.split(",").map((p) => p.trim());
  if (parts.length !== 2) return { value: null, unparsedText: trimmed };
  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { value: null, unparsedText: trimmed };
  }
  return { value: { latitude, longitude }, unparsedText: null };
}

export function isOutsideLatviaBbox(coords: { latitude: number; longitude: number }): boolean {
  return (
    coords.latitude < LATVIA_BBOX.minLat ||
    coords.latitude > LATVIA_BBOX.maxLat ||
    coords.longitude < LATVIA_BBOX.minLon ||
    coords.longitude > LATVIA_BBOX.maxLon
  );
}

/** Picks the first non-placeholder, non-blank value; counts distinct non-blank variants seen. */
function collapseByPreferRealValue(
  values: string[],
  isPlaceholder: (v: string) => boolean,
): { chosen: string | null; variantCount: number } {
  const distinctNonBlank = new Set(values.map((v) => v.trim()).filter((v) => v !== ""));
  const realValue = values.map((v) => v.trim()).find((v) => v !== "" && !isPlaceholder(v));
  return { chosen: realValue ?? null, variantCount: distinctNonBlank.size };
}

/** Picks the longest non-placeholder-looking value; counts distinct non-blank variants seen. */
function collapseByLongestValue(values: string[]): { chosen: string | null; variantCount: number } {
  const distinctNonBlank = new Set(values.map((v) => v.trim()).filter((v) => v !== ""));
  const candidates = [...distinctNonBlank].filter((v) => !BODY_TEXT_PLACEHOLDER_HINT.test(v));
  const pool = candidates.length > 0 ? candidates : [...distinctNonBlank];
  let longest: string | null = null;
  for (const value of pool) {
    if (longest === null || value.length > longest.length) longest = value;
  }
  return { chosen: longest, variantCount: distinctNonBlank.size };
}

// --- Section 6: per-image identity ---

function extractDriveFileId(driveUrl: string): string | null {
  const trimmed = driveUrl.trim();
  if (trimmed === "") return null;
  const patterns = [/\/d\/([a-zA-Z0-9_-]{10,})/, /[?&]id=([a-zA-Z0-9_-]{10,})/];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function buildImage(row: RawBlogImageRow): ParsedImage {
  const driveFileId = extractDriveFileId(row.driveUrl);
  if (driveFileId) {
    return {
      sourceRowNumber: row.sourceRowNumber,
      externalImageId: driveFileId,
      externalImageIdSource: "drive_file_id",
      driveFilename: row.driveFilename.trim() || null,
      driveUrl: row.driveUrl.trim() || null,
      originalImageUrl: row.originalImageUrl.trim() || null,
      caption: row.caption.trim() || null,
    };
  }
  const originalUrl = row.originalImageUrl.trim();
  if (originalUrl !== "") {
    return {
      sourceRowNumber: row.sourceRowNumber,
      externalImageId: originalUrl,
      externalImageIdSource: "original_url",
      driveFilename: row.driveFilename.trim() || null,
      driveUrl: row.driveUrl.trim() || null,
      originalImageUrl: originalUrl,
      caption: row.caption.trim() || null,
    };
  }
  const hash = createHash("sha256")
    .update(`${row.postId}|${row.sourceRowNumber ?? ""}|${row.driveFilename}|${row.caption}`)
    .digest("hex")
    .slice(0, 16);
  return {
    sourceRowNumber: row.sourceRowNumber,
    externalImageId: hash,
    externalImageIdSource: "content_hash",
    driveFilename: row.driveFilename.trim() || null,
    driveUrl: row.driveUrl.trim() || null,
    originalImageUrl: null,
    caption: row.caption.trim() || null,
  };
}

// --- Orchestration: group raw rows by post, then collapse one post ---

export function groupRowsByPost(rows: RawBlogImageRow[]): Map<string, RawBlogImageRow[]> {
  const groups = new Map<string, RawBlogImageRow[]>();
  for (const row of rows) {
    const key = row.postId.trim();
    if (key === "") continue; // no stable identity; caller should report these separately
    const existing = groups.get(key);
    if (existing) existing.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

export interface CollapsePostOptions {
  sourceSystem: string;
}

/**
 * Collapses one post's image rows into a single candidate record, applying
 * every section-3 precedence rule, section-1 scope triage and section-2
 * name/slug extraction. Slug collision resolution happens afterwards across
 * the whole candidate set (resolveSlugCollisions), so this returns the base
 * (pre-collision) slug under `slug` - the CLI overwrites it once the full
 * set is known.
 */
export function collapsePost(
  externalSourceId: string,
  rows: RawBlogImageRow[],
  options: CollapsePostOptions,
): CollapsedPost {
  const titles = [...new Set(rows.map((r) => r.title.trim()).filter((t) => t !== ""))];
  const title = titles[0] ?? "";
  const postUrl = rows.map((r) => r.postUrl.trim()).find((u) => u !== "") ?? null;

  const nameResult = extractPrimaryName(title);

  const address = collapseByPreferRealValue(
    rows.map((r) => r.address),
    (v) => ADDRESS_PLACEHOLDER.test(v),
  );

  const coordinateTexts = rows.map((r) => r.coordinates);
  const distinctCoordinateVariants = new Set(
    coordinateTexts.map((v) => v.trim()).filter((v) => v !== ""),
  );
  let resolvedCoordinates: { latitude: number; longitude: number } | null = null;
  let unparsedCoordinateText: string | null = null;
  for (const text of coordinateTexts) {
    const parsed = parseCoordinates(text);
    if (parsed.value) {
      resolvedCoordinates = parsed.value;
      break;
    }
    if (parsed.unparsedText && unparsedCoordinateText === null) {
      unparsedCoordinateText = parsed.unparsedText;
    }
  }
  if (resolvedCoordinates) unparsedCoordinateText = null;

  const bodyText = collapseByLongestValue(rows.map((r) => r.bodyText));

  const images = rows.map(buildImage);

  const matchedKeywordGroups = scanKeywordGroups(title);
  const scopeTriage = classifyScope(matchedKeywordGroups);
  const scopeDecisionResult = decideScopeConfirmed(scopeTriage, bodyText.chosen);

  const issues: string[] = [];
  if (scopeDecisionResult.basis === "body_text_affiliation_phrase") {
    issues.push(
      `scope decision: in_scope via body-text phrase "${scopeDecisionResult.bodyTextAffiliationPhraseMatched}" - title alone did not indicate this`,
    );
  }
  if (nameResult.ambiguousParentheses) {
    issues.push(
      "title has an unbalanced or leading parenthetical group; retained full title as name",
    );
  }
  // These fields have no source mapping in the real dataset at all
  // (docs/DAY5_COLUMN_MAPPING.md "Target fields with no source column at
  // all") and are never auto-derived here - see docs/DAY11_DRY_RUN_NOTES.md.
  issues.push("missing required fields: object_type, summary_lv, last_verified_at, municipality");
  if (address.chosen === null)
    issues.push("missing required field: address/municipality signal (Adrese)");
  if (resolvedCoordinates === null) issues.push("missing required fields: latitude, longitude");
  if (unparsedCoordinateText) issues.push(`unparsed coordinates text: "${unparsedCoordinateText}"`);
  const coordinatesOutsideLatviaBbox = resolvedCoordinates
    ? isOutsideLatviaBbox(resolvedCoordinates)
    : false;
  if (coordinatesOutsideLatviaBbox)
    issues.push("coordinates fall outside the approximate Latvia bounding box");

  // The Day 11 scope-confirmation pass (docs/DAY11_DRY_RUN_NOTES.md decision
  // 10): this is now a real, confirmed decision - not a placeholder - based
  // on every post's own title and body text, the only signal this dataset
  // provides without opening each blog post individually. It remains
  // reversible, per section 1's own "a product decision, not a permanent
  // one," which is why proposedStatusPendingConfirmation is false rather
  // than deleted as a concept.
  const proposedStatus: CollapsedPost["proposedStatus"] =
    scopeDecisionResult.decision === "archived_out_of_scope"
      ? "archived_out_of_scope"
      : "needs_review";
  const proposedStatusPendingConfirmation = false;

  return {
    sourceSystem: options.sourceSystem,
    externalSourceId,
    title,
    postUrl,
    primaryName: nameResult.primaryName,
    alternateNames: nameResult.alternateNames,
    locationHint: nameResult.locationHint,
    ambiguousParentheses: nameResult.ambiguousParentheses,
    slug: slugify(nameResult.primaryName), // pre-collision; CLI resolves collisions afterwards
    address: address.chosen,
    addressVariantCount: address.variantCount,
    coordinates: resolvedCoordinates,
    coordinatesVariantCount: distinctCoordinateVariants.size,
    coordinatesUnparsed: unparsedCoordinateText,
    coordinatesOutsideLatviaBbox,
    bodyText: bodyText.chosen,
    bodyTextVariantCount: bodyText.variantCount,
    images,
    matchedKeywordGroups,
    scopeTriage,
    bodyTextAffiliationPhraseMatched: scopeDecisionResult.bodyTextAffiliationPhraseMatched,
    scopeDecision: scopeDecisionResult.decision,
    scopeDecisionBasis: scopeDecisionResult.basis,
    issues,
    proposedStatus,
    proposedStatusPendingConfirmation,
  };
}
