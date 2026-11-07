import { describe, expect, it } from "vitest";
import {
  buildCandidateQueues,
  haversineMeters,
  namesShareEvidence,
  normalizeNameForMatching,
} from "./duplicateCandidates";
import type { CollapsedPost } from "./rawDatasetTypes";

function post(overrides: Partial<CollapsedPost> & { externalSourceId: string }): CollapsedPost {
  return {
    sourceSystem: "manasvietas_blogspot",
    title: overrides.primaryName ?? "Test",
    postUrl: null,
    primaryName: "Test",
    alternateNames: [],
    locationHint: null,
    ambiguousParentheses: false,
    slug: "test",
    address: null,
    addressVariantCount: 0,
    coordinates: null,
    coordinatesVariantCount: 0,
    coordinatesUnparsed: null,
    coordinatesOutsideLatviaBbox: false,
    bodyText: null,
    bodyTextVariantCount: 0,
    images: [],
    matchedKeywordGroups: ["manor"],
    scopeTriage: "in_scope_candidate",
    bodyTextAffiliationPhraseMatched: null,
    scopeDecision: "in_scope",
    scopeDecisionBasis: "title_keyword",
    issues: [],
    proposedStatus: "needs_review",
    proposedStatusPendingConfirmation: false,
    ...overrides,
  };
}

describe("normalizeNameForMatching", () => {
  it("folds diacritics and case so near-identical names match", () => {
    expect(normalizeNameForMatching("Bērzu muiža")).toBe(normalizeNameForMatching("berzu MUIZA"));
  });
});

describe("haversineMeters", () => {
  it("returns ~0 for identical points and a sane distance for known points", () => {
    const riga = { latitude: 56.9496, longitude: 24.1052 };
    expect(haversineMeters(riga, riga)).toBeLessThan(0.01);

    // Riga to Jurmala is roughly 20-25km.
    const jurmala = { latitude: 56.968, longitude: 23.7716 };
    const distance = haversineMeters(riga, jurmala);
    expect(distance).toBeGreaterThan(15_000);
    expect(distance).toBeLessThan(30_000);
  });
});

describe("namesShareEvidence", () => {
  it("treats exact equality, containment and a shared significant word as evidence", () => {
    expect(namesShareEvidence("rundales pils", "rundales pils")).toBe(true);
    expect(namesShareEvidence("rundales pils", "rundales pils ziemelu sparns")).toBe(true);
    expect(namesShareEvidence("rundales pils", "sv jana baznica")).toBe(false);
  });

  it("ignores short/common words and blank names", () => {
    // "un" ("and") is too short to count as identity evidence on its own.
    expect(namesShareEvidence("muiza un parks", "pils un dzirnavas")).toBe(false);
    expect(namesShareEvidence("", "")).toBe(false);
    expect(namesShareEvidence("kaut kas", "")).toBe(false);
  });
});

describe("buildCandidateQueues", () => {
  it("flags two in-scope posts with the same normalized name as duplicate candidates", () => {
    const posts = [
      post({ externalSourceId: "1", primaryName: "Rundāles pils" }),
      post({ externalSourceId: "2", primaryName: "rundales PILS" }),
    ];
    const { duplicateCandidates } = buildCandidateQueues(posts);
    expect(duplicateCandidates).toHaveLength(1);
    expect(duplicateCandidates[0].kind).toBe("name_match");
  });

  it("flags near-identical coordinates (<20m) as a duplicate candidate when the names also show supporting evidence", () => {
    const posts = [
      post({
        externalSourceId: "1",
        primaryName: "Rundāles pils",
        coordinates: { latitude: 56.9496, longitude: 24.1052 },
      }),
      post({
        externalSourceId: "2",
        // Not an exact name match (so this isn't already caught by the
        // name_match rule above) but shares the significant word "rundales".
        primaryName: "Rundāles pils ziemeļu spārns",
        coordinates: { latitude: 56.94961, longitude: 24.10521 },
      }),
    ];
    const { duplicateCandidates, relationshipCandidates } = buildCandidateQueues(posts);
    expect(duplicateCandidates).toHaveLength(1);
    expect(duplicateCandidates[0].kind).toBe("near_identical_coordinates");
    expect(relationshipCandidates).toHaveLength(0);
  });

  it("does NOT flag near-identical coordinates as a duplicate when the names show no supporting evidence - goes to the relationship queue instead", () => {
    // Regression test for a Day 11 Codex review finding: coordinates alone,
    // even under the 20m near-identical threshold, are not sufficient
    // proof of duplication per docs/DAY6_NORMALIZATION_RULES.md section 4.
    const posts = [
      post({
        externalSourceId: "1",
        primaryName: "Rundāles pils",
        coordinates: { latitude: 56.9496, longitude: 24.1052 },
      }),
      post({
        externalSourceId: "2",
        primaryName: "Sv. Jāņa baznīca",
        coordinates: { latitude: 56.94961, longitude: 24.10521 },
      }),
    ];
    const { duplicateCandidates, relationshipCandidates } = buildCandidateQueues(posts);
    expect(duplicateCandidates).toHaveLength(0);
    expect(relationshipCandidates).toHaveLength(1);
  });

  it("flags posts within 500m as relationship candidates, not duplicates", () => {
    const posts = [
      post({
        externalSourceId: "1",
        primaryName: "Manor House",
        coordinates: { latitude: 56.9496, longitude: 24.1052 },
      }),
      post({
        externalSourceId: "2",
        primaryName: "Manor Park",
        // ~0.003 degrees latitude is roughly 330m
        coordinates: { latitude: 56.9526, longitude: 24.1052 },
      }),
    ];
    const { duplicateCandidates, relationshipCandidates } = buildCandidateQueues(posts);
    expect(duplicateCandidates).toHaveLength(0);
    expect(relationshipCandidates).toHaveLength(1);
  });

  it("ignores posts farther than 500m and posts outside the in-scope set", () => {
    const posts = [
      post({
        externalSourceId: "1",
        primaryName: "Manor House",
        coordinates: { latitude: 56.9496, longitude: 24.1052 },
      }),
      post({
        externalSourceId: "2",
        primaryName: "Far Away Place",
        coordinates: { latitude: 57.5, longitude: 25.5 },
      }),
      post({
        externalSourceId: "3",
        primaryName: "Out Of Scope Nearby",
        scopeTriage: "out_of_scope_candidate",
        scopeDecision: "archived_out_of_scope",
        scopeDecisionBasis: "no_signal_found",
        coordinates: { latitude: 56.9497, longitude: 24.1053 },
      }),
    ];
    const { duplicateCandidates, relationshipCandidates } = buildCandidateQueues(posts);
    expect(duplicateCandidates).toHaveLength(0);
    expect(relationshipCandidates).toHaveLength(0);
  });
});
