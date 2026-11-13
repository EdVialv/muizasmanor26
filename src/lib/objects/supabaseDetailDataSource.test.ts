import { describe, expect, it } from "vitest";
import { createRecordingSupabaseClient } from "@/test-support/recordingSupabaseClient";
import { createSupabaseObjectDetailDataSource } from "./supabaseDetailDataSource";

const OBJECT_ID = "11111111-2222-4333-8444-555555555555";

describe("createSupabaseObjectDetailDataSource", () => {
  describe("fetchPublishedObjectBySlug", () => {
    it("reads one published row by slug, with an explicit public projection", async () => {
      const { client, queries } = createRecordingSupabaseClient();
      const source = createSupabaseObjectDetailDataSource(client);

      await source.fetchPublishedObjectBySlug("rundales-pils");

      expect(queries).toHaveLength(1);
      expect(queries[0].table).toBe("heritage_objects");
      expect(queries[0].filters).toEqual([
        ["eq", "status", "published"],
        ["eq", "slug", "rundales-pils"],
      ]);
      expect(queries[0].limit).toBe(1);
    });

    it("never selects internal columns", async () => {
      const { client, queries } = createRecordingSupabaseClient();
      const source = createSupabaseObjectDetailDataSource(client);

      await source.fetchPublishedObjectBySlug("rundales-pils");

      const selected = (queries[0].select ?? "").split(",").map((column) => column.trim());
      expect(selected).not.toContain("*");
      for (const internal of ["source_system", "external_source_id", "status", "created_at"]) {
        expect(selected).not.toContain(internal);
      }
    });

    it("returns the row, or null when there is none", async () => {
      const row = { id: OBJECT_ID, slug: "rundales-pils", name_lv: "Rundāles pils" };
      const found = createRecordingSupabaseClient({ data: [row], error: null });
      const missing = createRecordingSupabaseClient({ data: [], error: null });

      await expect(
        createSupabaseObjectDetailDataSource(found.client).fetchPublishedObjectBySlug(
          "rundales-pils",
        ),
      ).resolves.toEqual(row);
      await expect(
        createSupabaseObjectDetailDataSource(missing.client).fetchPublishedObjectBySlug("x"),
      ).resolves.toBeNull();
    });

    it("throws the underlying error rather than returning it as data", async () => {
      const { client } = createRecordingSupabaseClient({ data: null, error: new Error("boom") });

      await expect(
        createSupabaseObjectDetailDataSource(client).fetchPublishedObjectBySlug("rundales-pils"),
      ).rejects.toThrow("boom");
    });
  });

  it("fetchPublishedObjectById reads one published row by id", async () => {
    const { client, queries } = createRecordingSupabaseClient();

    await createSupabaseObjectDetailDataSource(client).fetchPublishedObjectById(OBJECT_ID);

    expect(queries[0].table).toBe("heritage_objects");
    expect(queries[0].select).toBe("id, slug, name_lv, object_type");
    expect(queries[0].filters).toEqual([
      ["eq", "status", "published"],
      ["eq", "id", OBJECT_ID],
    ]);
    expect(queries[0].limit).toBe(1);
  });

  it("fetchPublishedChildren reads published children in deterministic order, bounded", async () => {
    const { client, queries } = createRecordingSupabaseClient();

    await createSupabaseObjectDetailDataSource(client).fetchPublishedChildren(OBJECT_ID, 51);

    expect(queries[0].table).toBe("heritage_objects");
    expect(queries[0].filters).toEqual([
      ["eq", "status", "published"],
      ["eq", "parent_object_id", OBJECT_ID],
    ]);
    expect(queries[0].order).toEqual([
      ["name_lv", { ascending: true }],
      ["id", { ascending: true }],
    ]);
    expect(queries[0].limit).toBe(51);
  });

  it("fetchVerifiedOwnerFamilies reads only verified associations, bounded", async () => {
    const { client, queries } = createRecordingSupabaseClient();

    await createSupabaseObjectDetailDataSource(client).fetchVerifiedOwnerFamilies(OBJECT_ID, 50);

    expect(queries[0].table).toBe("object_historical_owner_families");
    expect(queries[0].select).toBe("family_name, start_year_approx, end_year_approx");
    expect(queries[0].filters).toEqual([
      ["eq", "object_id", OBJECT_ID],
      ["eq", "verification_status", "verified"],
    ]);
    expect(queries[0].limit).toBe(50);
  });
});
