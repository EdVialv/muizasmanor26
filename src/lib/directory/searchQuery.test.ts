import { describe, expect, it } from "vitest";
import {
  MAX_SEARCH_QUERY_LENGTH,
  MAX_SEARCH_TERMS,
  normalizeSearchQuery,
  searchScope,
} from "./searchQuery";

describe("normalizeSearchQuery", () => {
  it("trims and collapses any whitespace to single spaces", () => {
    expect(normalizeSearchQuery("  Rundāles \t\n  pils  ")).toBe("Rundāles pils");
  });

  it("keeps case and diacritics as typed - the database folds both", () => {
    expect(normalizeSearchQuery("TĪMAŅU Muiža")).toBe("TĪMAŅU Muiža");
  });

  it("treats precomposed and combining-mark spellings as the same query", () => {
    const precomposed = "Rundāles";
    const combining = "Rundāles";
    expect(normalizeSearchQuery(combining)).toBe(normalizeSearchQuery(precomposed));
  });

  it("returns null for empty, whitespace-only and non-string input", () => {
    expect(normalizeSearchQuery("")).toBeNull();
    expect(normalizeSearchQuery("   \t ")).toBeNull();
    expect(normalizeSearchQuery(undefined)).toBeNull();
    expect(normalizeSearchQuery(null)).toBeNull();
    expect(normalizeSearchQuery(["rundale", "cesis"])).toBeNull();
    expect(normalizeSearchQuery(42)).toBeNull();
  });

  it(`keeps at most ${MAX_SEARCH_TERMS} terms`, () => {
    expect(normalizeSearchQuery("a b c d e f g")).toBe("a b c d e");
  });

  it(`cuts to ${MAX_SEARCH_QUERY_LENGTH} characters without splitting a character`, () => {
    const long = "ā".repeat(MAX_SEARCH_QUERY_LENGTH + 50);
    const result = normalizeSearchQuery(long) ?? "";
    expect(Array.from(result)).toHaveLength(MAX_SEARCH_QUERY_LENGTH);
    expect(result).toBe("ā".repeat(MAX_SEARCH_QUERY_LENGTH));
  });

  it("passes SQL- and LIKE-shaped input through as plain text (the database binds it as a value)", () => {
    expect(normalizeSearchQuery("' or 1=1 --")).toBe("' or 1=1 --");
    expect(normalizeSearchQuery("m_iza 100%")).toBe("m_iza 100%");
  });
});

describe("searchScope", () => {
  it("is a stable 16-character hex fingerprint", () => {
    expect(searchScope("rundales")).toMatch(/^[0-9a-f]{16}$/);
    expect(searchScope("rundales")).toBe(searchScope("rundales"));
  });

  it("differs between different queries", () => {
    const scopes = new Set(
      ["rundales", "Rundales", "rundales pils", "pils rundales", "cesis", ""].map(searchScope),
    );
    expect(scopes.size).toBe(6);
  });

  it("covers the whole UTF-8 text, not just ASCII", () => {
    expect(searchScope("Rundāles")).not.toBe(searchScope("Rundales"));
  });
});
