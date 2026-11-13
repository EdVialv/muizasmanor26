import type { SupabaseClient } from "@supabase/supabase-js";
import { vi } from "vitest";

export interface RecordedQuery {
  table?: string;
  rpc?: { name: string; args: unknown };
  select?: string;
  filters: Array<[method: string, column: string, value: unknown]>;
  order: Array<[column: string, options: unknown]>;
  limit?: number;
  /** Limits applied to an embedded table, keyed by that table's name. */
  embeddedLimits: Record<string, number>;
}

/**
 * A minimal fluent stand-in for supabase-js's query builder that records
 * every call, so a test can assert on the exact table, projection, filters,
 * ordering and limit a data source issues - without a live Supabase project.
 *
 * Each `from()`/`rpc()` starts a new recorded query. The builder is
 * awaitable at any point after `select()`/`rpc()`, like the real one, and
 * resolves to the next queued result (or the default).
 */
export function createRecordingSupabaseClient(
  defaultResult: { data: unknown; error: unknown } = { data: [], error: null },
) {
  const queries: RecordedQuery[] = [];
  const queuedResults: Array<{ data: unknown; error: unknown }> = [];

  function builderFor(query: RecordedQuery) {
    const builder = {
      select: vi.fn((columns: string) => {
        query.select = columns;
        return builder;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        query.filters.push(["eq", column, value]);
        return builder;
      }),
      gt: vi.fn((column: string, value: unknown) => {
        query.filters.push(["gt", column, value]);
        return builder;
      }),
      in: vi.fn((column: string, value: unknown) => {
        query.filters.push(["in", column, value]);
        return builder;
      }),
      order: vi.fn((column: string, options: unknown) => {
        query.order.push([column, options]);
        return builder;
      }),
      neq: vi.fn((column: string, value: unknown) => {
        query.filters.push(["neq", column, value]);
        return builder;
      }),
      limit: vi.fn((count: number, options?: { referencedTable?: string }) => {
        if (options?.referencedTable) {
          query.embeddedLimits[options.referencedTable] = count;
        } else {
          query.limit = count;
        }
        return builder;
      }),
      then: (
        resolve: (value: { data: unknown; error: unknown }) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve(queuedResults.shift() ?? defaultResult).then(resolve, reject),
    };
    return builder;
  }

  const client = {
    from: vi.fn((table: string) => {
      const query: RecordedQuery = { table, filters: [], order: [], embeddedLimits: {} };
      queries.push(query);
      return builderFor(query);
    }),
    rpc: vi.fn((name: string, args: unknown) => {
      const query: RecordedQuery = {
        rpc: { name, args },
        filters: [],
        order: [],
        embeddedLimits: {},
      };
      queries.push(query);
      return builderFor(query);
    }),
  };

  return {
    client: client as unknown as SupabaseClient,
    queries,
    /** Queue the result for the next awaited query (FIFO). */
    queueResult(result: { data: unknown; error: unknown }) {
      queuedResults.push(result);
    },
  };
}
