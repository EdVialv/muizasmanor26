import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { fetchFamilyOptions } = vi.hoisted(() => ({ fetchFamilyOptions: vi.fn() }));
vi.mock("@/lib/directory/familyOptions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/directory/familyOptions")>()),
  fetchFamilyOptions,
}));

import { GET } from "./route";

function request(query = "") {
  return new NextRequest(`http://localhost/api/directory/families${query}`);
}

describe("GET /api/directory/families", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    fetchFamilyOptions.mockReset();
  });

  it("returns at most the matching names and counts, with the search normalised", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    fetchFamilyOptions.mockResolvedValue({
      options: [{ value: "Ābele", count: 3 }],
      hasMore: false,
    });

    const response = await GET(request("?q=%20%C4%81bele%20"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      options: [{ value: "Ābele", count: 3 }],
      hasMore: false,
    });
    expect(fetchFamilyOptions.mock.calls[0][1]).toBe("ābele");
    expect(response.headers.get("cache-control")).toMatch(/max-age=60/);
  });

  it("treats a missing search as the start of the list", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    fetchFamilyOptions.mockResolvedValue({ options: [], hasMore: false });

    await GET(request());

    expect(fetchFamilyOptions.mock.calls[0][1]).toBeNull();
  });

  it("answers 503 without details when the data source is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(request("?q=a"));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
    expect(fetchFamilyOptions).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("answers 502 without leaking the underlying error", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    fetchFamilyOptions.mockRejectedValue(new Error("relation does not exist: secret detail"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(request("?q=a"));

    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toMatch(/secret detail/);
    consoleError.mockRestore();
  });
});
