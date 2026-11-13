import { afterEach, describe, expect, it, vi } from "vitest";
import { createRecordingSupabaseClient } from "@/test-support/recordingSupabaseClient";
import { DirectoryConfigurationError } from "./queries";
import {
  createDirectorySearchDataSourceFromEnv,
  createSupabaseDirectorySearchDataSource,
  SEARCH_FUNCTION,
} from "./supabaseSearchDataSource";

const OBJECT_ID = "11111111-2222-4333-8444-555555555555";

describe("createSupabaseDirectorySearchDataSource", () => {
  it("calls the search function with the query and no keyset position on the first page", async () => {
    const { client, queries } = createRecordingSupabaseClient();

    await createSupabaseDirectorySearchDataSource(client).searchPublishedObjects(
      "rundales",
      null,
      25,
    );

    expect(queries).toHaveLength(1);
    expect(queries[0].rpc).toEqual({
      name: SEARCH_FUNCTION,
      args: { search_query: "rundales", after_name: null, after_id: null, page_size: 25 },
    });
    expect(queries[0].filters).toEqual([]);
  });

  it("passes the cursor's name and id as separate, bound arguments", async () => {
    const { client, queries } = createRecordingSupabaseClient();
    const trickyName = 'Rundāles pils (ziemeļu spārns, "jaunais")';

    await createSupabaseDirectorySearchDataSource(client).searchPublishedObjects(
      "' or 1=1 --",
      { name: trickyName, id: OBJECT_ID, scope: "0123456789abcdef" },
      25,
    );

    expect(queries[0].rpc?.args).toEqual({
      search_query: "' or 1=1 --",
      after_name: trickyName,
      after_id: OBJECT_ID,
      page_size: 25,
    });
  });

  it("maps result rows onto the directory row shape, cover image included", async () => {
    const { client } = createRecordingSupabaseClient({
      data: [
        {
          id: OBJECT_ID,
          slug: "rundales-pils",
          name_lv: "Rundāles pils",
          object_type: "palace_or_castle",
          municipality: "Bauskas novads",
          condition_category: "class_a",
          ownership_type: "state",
          public_access: "open",
          cover_image_url: "https://blogger.googleusercontent.com/img/x/s1600/a.jpg",
          cover_image_alt_lv: null,
        },
        {
          id: "22222222-2222-4333-8444-555555555555",
          slug: "bez-attela",
          name_lv: "Bez attēla",
          object_type: "manor_estate",
          municipality: null,
          condition_category: null,
          ownership_type: null,
          public_access: null,
          cover_image_url: null,
          cover_image_alt_lv: null,
        },
      ],
      error: null,
    });

    const rows = await createSupabaseDirectorySearchDataSource(client).searchPublishedObjects(
      "pils",
      null,
      25,
    );

    expect(rows[0]).toEqual({
      id: OBJECT_ID,
      slug: "rundales-pils",
      name_lv: "Rundāles pils",
      object_type: "palace_or_castle",
      municipality: "Bauskas novads",
      condition_category: "class_a",
      ownership_type: "state",
      public_access: "open",
      object_images: [
        {
          source_image_url: "https://blogger.googleusercontent.com/img/x/s1600/a.jpg",
          alt_text_lv: null,
        },
      ],
    });
    expect(rows[1].object_images).toEqual([]);
  });

  it("throws the underlying error rather than returning it as data", async () => {
    const { client } = createRecordingSupabaseClient({ data: null, error: new Error("boom") });

    await expect(
      createSupabaseDirectorySearchDataSource(client).searchPublishedObjects("x", null, 25),
    ).rejects.toThrow("boom");
  });
});

describe("createDirectorySearchDataSourceFromEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports missing configuration the same way the plain directory does", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");

    expect(() => createDirectorySearchDataSourceFromEnv()).toThrow(DirectoryConfigurationError);
  });
});
