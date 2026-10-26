import { describe, expect, it } from "vitest";
import { buildStagingCandidate, parseHistoricalOwnerFamilies } from "./parseSample";
import type { RawSampleRow } from "./types";

function row(overrides: Partial<RawSampleRow> = {}): RawSampleRow {
  return {
    object_type: "manor_estate",
    parent_object_id: "",
    name_lv: "Test muiža",
    slug: "test-muiza",
    summary_research_en: "English research note only.",
    municipality: "Test novads",
    latitude: "56.9",
    longitude: "24.1",
    condition_category: "",
    ownership_type: "",
    cadastre_references: "",
    cadastre_verified_at: "",
    cadastre_source_url: "",
    historical_owner_families: "von Test",
    source_url: "https://example.com",
    source_accessed_at: "2026-10-08",
    notes: "",
    ...overrides,
  };
}

describe("parseHistoricalOwnerFamilies", () => {
  it("splits a normal semicolon-separated list", () => {
    expect(parseHistoricalOwnerFamilies("von Biron; Zubov; Shuvalov")).toEqual([
      { family_name: "von Biron", source_url: null, verification_status: "unverified" },
      { family_name: "Zubov", source_url: null, verification_status: "unverified" },
      { family_name: "Shuvalov", source_url: null, verification_status: "unverified" },
    ]);
  });

  it("keeps a parenthetical detail attached to its family rather than splitting on the comma inside it", () => {
    expect(
      parseHistoricalOwnerFamilies(
        "von Lieven (Charlotte, Johann, Paul, Anatol); von Medem (tenants, late Courland period)",
      ),
    ).toEqual([
      {
        family_name: "von Lieven (Charlotte, Johann, Paul, Anatol)",
        source_url: null,
        verification_status: "unverified",
      },
      {
        family_name: "von Medem (tenants, late Courland period)",
        source_url: null,
        verification_status: "unverified",
      },
    ]);
  });

  it("treats a '(none confirmed ...)' sentinel as zero families, even though it contains a semicolon", () => {
    expect(
      parseHistoricalOwnerFamilies(
        "(none confirmed -- predates noble-family ownership; associated with the ancient Semigallian/Zemgaļi tribal society)",
      ),
    ).toEqual([]);
  });

  it("treats a blank field as zero families", () => {
    expect(parseHistoricalOwnerFamilies("")).toEqual([]);
    expect(parseHistoricalOwnerFamilies("   ")).toEqual([]);
  });
});

describe("buildStagingCandidate", () => {
  it("resolves every other field cleanly, but this CSV shape has no summary_lv column at all", () => {
    // RawSampleRow has no summary_lv field - only summary_research_en, which
    // is never mapped to it (docs/DAY10_IMPORTER_NOTES.md decision 3) - so
    // even an otherwise-complete row from this sample can only ever reach
    // needs_review, never ready_for_import. This is the importer correctly
    // enforcing heritage_objects' NOT NULL contract, not a bug; see the
    // integration test in docs/DAY10_IMPORTER_NOTES.md for a case that does
    // reach ready_for_import/imported using a synthetic staging row that
    // supplies summary_lv directly (bypassing this CSV's shape).
    const candidate = buildStagingCandidate(row(), { sourceSystem: "unit_test" });
    expect(candidate.external_source_id).toBe("test-muiza");
    expect(candidate.summary_lv).toBeNull();
    expect(candidate.status).toBe("needs_review");
    expect(candidate.status_reason).toBe("missing required fields: summary_lv");
  });

  it("flags every missing required field by name", () => {
    const candidate = buildStagingCandidate(
      row({ municipality: "", latitude: "", longitude: "" }),
      { sourceSystem: "unit_test" },
    );
    expect(candidate.status).toBe("needs_review");
    expect(candidate.status_reason).toContain("municipality");
    expect(candidate.status_reason).toContain("latitude");
    expect(candidate.status_reason).toContain("longitude");
  });

  it("rejects a row that has no stable external identifier", () => {
    expect(() => buildStagingCandidate(row({ slug: "" }), { sourceSystem: "unit_test" })).toThrow(
      "without a slug",
    );
  });

  it("flags an unrecognized object_type as an issue rather than silently defaulting it", () => {
    const candidate = buildStagingCandidate(row({ object_type: "castle_ish" }), {
      sourceSystem: "unit_test",
    });
    expect(candidate.object_type).toBeNull();
    expect(candidate.status).toBe("needs_review");
    expect(candidate.status_reason).toContain('invalid object_type "castle_ish"');
  });

  it("flags a non-empty cadastre_references column instead of silently discarding it", () => {
    const candidate = buildStagingCandidate(row({ cadastre_references: "12345" }), {
      sourceSystem: "unit_test",
    });
    expect(candidate.cadastre_references).toEqual([]);
    expect(candidate.status_reason).toContain("cadastre_references column has a value");
  });

  it("carries parent_object_id through as parent_external_source_id unchanged", () => {
    const candidate = buildStagingCandidate(row({ parent_object_id: "rundales-pils" }), {
      sourceSystem: "unit_test",
    });
    expect(candidate.parent_external_source_id).toBe("rundales-pils");
  });

  it("produces a stable hash for identical rows and a different hash when the row changes", () => {
    const a = buildStagingCandidate(row(), { sourceSystem: "unit_test" });
    const b = buildStagingCandidate(row(), { sourceSystem: "unit_test" });
    const c = buildStagingCandidate(row({ notes: "a new research note" }), {
      sourceSystem: "unit_test",
    });
    expect(a.raw_payload_hash).toBe(b.raw_payload_hash);
    expect(a.raw_payload_hash).not.toBe(c.raw_payload_hash);
  });
});
