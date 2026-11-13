import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createSupabaseDirectoryDataSource } from "./supabaseDataSource";

interface RecordedCalls {
  from: unknown[];
  select: unknown[];
  eq: unknown[][];
  gt: unknown[][];
  order: unknown[][];
  limit: unknown[];
}

/**
 * A minimal fluent stand-in for supabase-js's PostgrestQueryBuilder,
 * recording every call so the tests can assert on the exact filter/order/
 * limit calls issued - without a live Supabase project, this is the only
 * way to verify "deterministic pagination query behaviour" for the real
 * Supabase-backed implementation (the in-memory fake in queries.test.ts
 * verifies the orchestration logic, not this query construction).
 */
function createMockClient(result: { data: unknown; error: unknown }) {
  const calls: RecordedCalls = { from: [], select: [], eq: [], gt: [], order: [], limit: [] };

  const builder = {
    from: vi.fn((table: string) => {
      calls.from.push(table);
      return builder;
    }),
    select: vi.fn((columns: string) => {
      calls.select.push(columns);
      return builder;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      calls.eq.push([column, value]);
      return builder;
    }),
    gt: vi.fn((column: string, value: unknown) => {
      calls.gt.push([column, value]);
      return builder;
    }),
    order: vi.fn((column: string, options: unknown) => {
      calls.order.push([column, options]);
      return builder;
    }),
    limit: vi.fn(async (count: number) => {
      calls.limit.push(count);
      return result;
    }),
  };

  return { client: builder as unknown as SupabaseClient, calls };
}

describe("createSupabaseDirectoryDataSource", () => {
  describe("fetchFirstPage", () => {
    it("selects only published rows, ordered by name_lv then id, with the given limit", async () => {
      const { client, calls } = createMockClient({ data: [], error: null });
      const dataSource = createSupabaseDirectoryDataSource(client);

      await dataSource.fetchFirstPage(25);

      expect(calls.from).toEqual(["heritage_objects"]);
      expect(calls.eq).toEqual([
        ["status", "published"],
        ["object_images.is_primary", true],
      ]);
      expect(calls.order).toEqual([
        ["name_lv", { ascending: true }],
        ["id", { ascending: true }],
      ]);
      expect(calls.limit).toEqual([25]);
      expect(calls.gt).toEqual([]);
    });

    it("returns the rows from the response", async () => {
      const rows = [{ id: "1", slug: "a", name_lv: "A", object_type: "manor_estate" }];
      const { client } = createMockClient({ data: rows, error: null });
      const dataSource = createSupabaseDirectoryDataSource(client);

      await expect(dataSource.fetchFirstPage(25)).resolves.toEqual(rows);
    });

    it("throws the underlying error rather than returning it as data", async () => {
      const { client } = createMockClient({ data: null, error: new Error("boom") });
      const dataSource = createSupabaseDirectoryDataSource(client);

      await expect(dataSource.fetchFirstPage(25)).rejects.toThrow("boom");
    });
  });

  describe("fetchSameNameAfterId", () => {
    it("filters on the exact name and a strictly greater id, ordered by id only", async () => {
      const { client, calls } = createMockClient({ data: [], error: null });
      const dataSource = createSupabaseDirectoryDataSource(client);

      await dataSource.fetchSameNameAfterId("Rundāles pils", "some-id", 10);

      expect(calls.eq).toEqual([
        ["status", "published"],
        ["object_images.is_primary", true],
        ["name_lv", "Rundāles pils"],
      ]);
      expect(calls.gt).toEqual([["id", "some-id"]]);
      expect(calls.order).toEqual([["id", { ascending: true }]]);
      expect(calls.limit).toEqual([10]);
    });
  });

  describe("fetchAfterName", () => {
    it("filters on name strictly greater than the cursor, ordered by name_lv then id", async () => {
      const { client, calls } = createMockClient({ data: [], error: null });
      const dataSource = createSupabaseDirectoryDataSource(client);

      await dataSource.fetchAfterName("Rundāles pils", 10);

      expect(calls.eq).toEqual([
        ["status", "published"],
        ["object_images.is_primary", true],
      ]);
      expect(calls.gt).toEqual([["name_lv", "Rundāles pils"]]);
      expect(calls.order).toEqual([
        ["name_lv", { ascending: true }],
        ["id", { ascending: true }],
      ]);
      expect(calls.limit).toEqual([10]);
    });

    it("passes the name value as a plain filter argument, never interpolated into a filter string", async () => {
      // Regression guard for the exact risk documented in queries.ts: a name
      // containing commas/parentheses must never need escaping here, because
      // .gt() takes it as an ordinary parameter, not as part of a composite
      // or()/and() filter string this module would have to build and quote.
      const trickyName = 'Rundāles pils (ziemeļu spārns, "jaunais korpuss")';
      const { client, calls } = createMockClient({ data: [], error: null });
      const dataSource = createSupabaseDirectoryDataSource(client);

      await dataSource.fetchAfterName(trickyName, 10);

      expect(calls.gt).toEqual([["name_lv", trickyName]]);
    });
  });
});
