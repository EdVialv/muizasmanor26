// Section 4 of docs/DAY6_NORMALIZATION_RULES.md: duplicate-candidate and
// relationship-candidate detection across posts (never within one post -
// that is section 3's job in rawDatasetTransform.ts). Pure functions only;
// no database or filesystem access. Resolution is always manual - this only
// builds the two review queues, and never auto-merges or auto-links anything.

import { transliterate } from "./rawDatasetTransform";
import type { CollapsedPost, DuplicateCandidate, RelationshipCandidate } from "./rawDatasetTypes";

const RELATIONSHIP_THRESHOLD_METERS = 500;
/** Treat coordinates this close as "the same point" for duplicate detection, not just nearby. */
const NEAR_IDENTICAL_THRESHOLD_METERS = 20;

export function normalizeNameForMatching(name: string): string {
  return transliterate(name)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Latvian function words/particles too short and too common to count as identity evidence on their own. */
const SIGNIFICANT_WORD_MIN_LENGTH = 4;

/**
 * Whether two already-normalized names (normalizeNameForMatching output)
 * show enough overlap to count as supporting evidence that they describe
 * the same physical object - exact equality, one containing the other, or
 * sharing a "significant" (4+ character) word. This is deliberately a
 * weaker test than exact-match (that's handled separately, as a duplicate
 * candidate on its own): it exists only to decide whether near-identical
 * *coordinates* are corroborated by the names, or whether the coordinates
 * are the only signal - see buildCandidateQueues for why that distinction
 * matters.
 */
export function namesShareEvidence(normalizedA: string, normalizedB: string): boolean {
  if (normalizedA === "" || normalizedB === "") return false;
  if (normalizedA === normalizedB) return true;
  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) return true;

  const wordsA = new Set(
    normalizedA.split(" ").filter((word) => word.length >= SIGNIFICANT_WORD_MIN_LENGTH),
  );
  for (const word of normalizedB.split(" ")) {
    if (word.length >= SIGNIFICANT_WORD_MIN_LENGTH && wordsA.has(word)) return true;
  }
  return false;
}

const EARTH_RADIUS_METERS = 6_371_000;

export function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface CandidateQueues {
  duplicateCandidates: DuplicateCandidate[];
  relationshipCandidates: RelationshipCandidate[];
}

/**
 * Builds the duplicate and relationship review queues for the in-scope
 * candidate posts only (docs/DAY6_NORMALIZATION_RULES.md section 4: "flag
 * two in-scope posts"). Posts without resolved coordinates simply cannot
 * take part in the coordinate-based checks.
 */
export function buildCandidateQueues(posts: CollapsedPost[]): CandidateQueues {
  const inScope = posts.filter((p) => p.scopeDecision === "in_scope");

  const duplicateCandidates: DuplicateCandidate[] = [];
  const duplicatePairKeys = new Set<string>();

  const byNormalizedName = new Map<string, CollapsedPost[]>();
  for (const post of inScope) {
    const key = normalizeNameForMatching(post.primaryName);
    if (key === "") continue;
    const existing = byNormalizedName.get(key);
    if (existing) existing.push(post);
    else byNormalizedName.set(key, [post]);
  }
  for (const group of byNormalizedName.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const [a, b] = [group[i], group[j]];
        duplicateCandidates.push({
          kind: "name_match",
          postA: a.externalSourceId,
          postB: b.externalSourceId,
          detail: `normalized primary name "${normalizeNameForMatching(a.primaryName)}" matches`,
        });
        duplicatePairKeys.add(pairKey(a.externalSourceId, b.externalSourceId));
      }
    }
  }

  const withCoords = inScope.filter(
    (p): p is CollapsedPost & { coordinates: { latitude: number; longitude: number } } =>
      p.coordinates !== null,
  );

  // docs/DAY6_NORMALIZATION_RULES.md section 4: "flag two in-scope posts
  // when their normalised primary names match ... or when both name and
  // coordinates indicate the same physical object." Coordinates alone are
  // explicitly NOT sufficient: "Proximity alone is not evidence of
  // duplication: parks, houses, stables and neighbouring sites legitimately
  // cluster." A Day 11 Codex review finding: the previous implementation
  // treated near-identical coordinates (<20m) as a duplicate candidate on
  // their own, with no name check at all. Fixed below - near-identical
  // coordinates only become a duplicate candidate when the names also show
  // supporting evidence (namesShareEvidence); otherwise, like any other
  // pair within the relationship threshold, they go to the
  // relationship-review queue instead. See docs/DAY11_DRY_RUN_NOTES.md
  // decision 11 for the full writeup.
  const relationshipCandidates: RelationshipCandidate[] = [];
  for (let i = 0; i < withCoords.length; i += 1) {
    for (let j = i + 1; j < withCoords.length; j += 1) {
      const a = withCoords[i];
      const b = withCoords[j];
      const distanceMeters = haversineMeters(a.coordinates, b.coordinates);
      if (distanceMeters > RELATIONSHIP_THRESHOLD_METERS) continue;

      const key = pairKey(a.externalSourceId, b.externalSourceId);
      if (duplicatePairKeys.has(key)) continue; // already a name-match duplicate candidate

      const isNearIdentical = distanceMeters <= NEAR_IDENTICAL_THRESHOLD_METERS;
      const hasNameEvidence = namesShareEvidence(
        normalizeNameForMatching(a.primaryName),
        normalizeNameForMatching(b.primaryName),
      );

      if (isNearIdentical && hasNameEvidence) {
        duplicateCandidates.push({
          kind: "near_identical_coordinates",
          postA: a.externalSourceId,
          postB: b.externalSourceId,
          detail: `coordinates ${distanceMeters.toFixed(1)}m apart, and names show supporting evidence ("${normalizeNameForMatching(a.primaryName)}" / "${normalizeNameForMatching(b.primaryName)}")`,
        });
        duplicatePairKeys.add(key);
        continue;
      }

      // Either farther apart than the near-identical threshold, or
      // near-identical with no corroborating name evidence - coordinates
      // alone are not sufficient proof of duplication, so this pair goes to
      // the relationship-review queue instead of the duplicate queue.
      relationshipCandidates.push({
        postA: a.externalSourceId,
        postB: b.externalSourceId,
        distanceMeters,
      });
    }
  }

  return { duplicateCandidates, relationshipCandidates };
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
