import { afterEach, describe, expect, it, vi } from "vitest";
import { createRecordingSupabaseClient } from "@/test-support/recordingSupabaseClient";
import {
  MAX_REGION_OPTIONS,
  REGION_OPTIONS_FUNCTION,
  fetchRegionOptions,
  loadRegionOptionsFromEnv,
} from "./regionOptions";

describe("fetchRegionOptions", () => {
  it("calls the RLS-checked municipality function with a bounded result", async () => {
    const { client, queries } = createRecordingSupabaseClient({ data: [], error: null });

    await fetchRegionOptions(client);

    expect(queries[0].rpc?.name).toBe(REGION_OPTIONS_FUNCTION);
    expect(queries[0].limit).toBe(MAX_REGION_OPTIONS);
  });

  it("keeps valid municipalities with their counts and skips unusable rows", async () => {
    const { client } = createRecordingSupabaseClient({
      data: [
        { municipality: "Bauskas novads (Rundāles pagasts)", object_count: 3 },
        { municipality: "  Cēsu novads ", object_count: "9" },
        { municipality: "", object_count: 1 },
        { municipality: "x".repeat(500), object_count: 1 },
        { municipality: "Tukuma novads", object_count: 0 },
        { municipality: null, object_count: 2 },
      ],
      error: null,
    });

    await expect(fetchRegionOptions(client)).resolves.toEqual([
      { value: "Bauskas novads (Rundāles pagasts)", count: 3 },
      { value: "Cēsu novads", count: 9 },
    ]);
  });

  it("throws the underlying error", async () => {
    const { client } = createRecordingSupabaseClient({
      data: null,
      error: new Error("no such function"),
    });
    await expect(fetchRegionOptions(client)).rejects.toThrow("no such function");
  });
});

describe("loadRegionOptionsFromEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns null instead of failing the page when options cannot be loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");

    await expect(loadRegionOptionsFromEnv()).resolves.toBeNull();
  });
});
