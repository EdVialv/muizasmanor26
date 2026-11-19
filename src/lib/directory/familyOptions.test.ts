import { describe, expect, it } from "vitest";
import { createRecordingSupabaseClient } from "@/test-support/recordingSupabaseClient";
import {
  FAMILY_OPTIONS_FUNCTION,
  FAMILY_OPTIONS_LIMIT,
  FAMILY_OPTIONS_PATH,
  MAX_FAMILY_SEARCH_LENGTH,
  familyOptionsHref,
  fetchFamilyOptions,
  normalizeFamilySearch,
  parseFamilyOptionsResponse,
} from "./familyOptions";

describe("fetchFamilyOptions", () => {
  it("asks the RLS-checked function for one more row than it shows, with the search bound as an argument", async () => {
    const { client, queries } = createRecordingSupabaseClient({ data: [], error: null });

    await fetchFamilyOptions(client, "' or 1=1 --");

    expect(queries[0].rpc).toEqual({
      name: FAMILY_OPTIONS_FUNCTION,
      args: { search: "' or 1=1 --", row_limit: FAMILY_OPTIONS_LIMIT + 1 },
    });
  });

  it("keeps valid names with counts, in Latvian order, and skips unusable rows", async () => {
    const { client } = createRecordingSupabaseClient({
      data: [
        { family_name: "Zēgesers", object_count: 2 },
        { family_name: "  Ābele ", object_count: "3" },
        { family_name: "Bērziņš", object_count: 1 },
        { family_name: "", object_count: 4 },
        { family_name: "x".repeat(500), object_count: 1 },
        { family_name: "Nulle", object_count: 0 },
        { family_name: null, object_count: 2 },
      ],
      error: null,
    });

    await expect(fetchFamilyOptions(client, null)).resolves.toEqual({
      options: [
        { value: "Ābele", count: 3 },
        { value: "Bērziņš", count: 1 },
        { value: "Zēgesers", count: 2 },
      ],
      hasMore: false,
    });
  });

  it("reports when more names match than are shown", async () => {
    const { client } = createRecordingSupabaseClient({
      data: Array.from({ length: FAMILY_OPTIONS_LIMIT + 1 }, (_, i) => ({
        family_name: `Dzimta ${String(i).padStart(2, "0")}`,
        object_count: 1,
      })),
      error: null,
    });

    const result = await fetchFamilyOptions(client, "dzimta");
    expect(result.options).toHaveLength(FAMILY_OPTIONS_LIMIT);
    expect(result.hasMore).toBe(true);
  });

  it("throws the underlying error", async () => {
    const { client } = createRecordingSupabaseClient({ data: null, error: new Error("boom") });
    await expect(fetchFamilyOptions(client, null)).rejects.toThrow("boom");
  });
});

describe("family search helpers", () => {
  it("normalises and bounds the search text", () => {
    expect(normalizeFamilySearch("  pāle ")).toBe("pāle");
    expect(normalizeFamilySearch("   ")).toBeNull();
    expect(normalizeFamilySearch(null)).toBeNull();
    expect(Array.from(normalizeFamilySearch("ā".repeat(300)) ?? "")).toHaveLength(
      MAX_FAMILY_SEARCH_LENGTH,
    );
  });

  it("builds the route URL, encoding the search", () => {
    expect(familyOptionsHref(null)).toBe(FAMILY_OPTIONS_PATH);
    expect(familyOptionsHref(" von der ")).toBe(`${FAMILY_OPTIONS_PATH}?q=von+der`);
    expect(familyOptionsHref("a&b=c")).toBe(`${FAMILY_OPTIONS_PATH}?q=a%26b%3Dc`);
  });

  it("validates a response body and rejects anything unexpected", () => {
    expect(
      parseFamilyOptionsResponse({
        options: [{ value: "Ābele", count: 2 }, { value: "", count: 1 }, { nope: true }, null],
        hasMore: false,
      }),
    ).toEqual({ options: [{ value: "Ābele", count: 2 }], hasMore: false });
    expect(parseFamilyOptionsResponse({ error: "unavailable" })).toBeNull();
    expect(parseFamilyOptionsResponse(null)).toBeNull();
    expect(parseFamilyOptionsResponse({ options: "x", hasMore: true })).toBeNull();
  });
});
