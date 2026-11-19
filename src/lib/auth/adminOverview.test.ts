import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { loadObjectStatusCounts, loadStaffCounts } from "./adminOverview";

function client(counts: Record<string, number | null>, failOn?: string) {
  return {
    from: vi.fn((table: string) => ({
      select: () => ({
        eq: async (_column: string, value: string) =>
          value === failOn
            ? { count: null, error: { message: "permission denied" } }
            : { count: counts[`${table}:${value}`] ?? 0, error: null },
      }),
    })),
  } as unknown as SupabaseClient;
}

describe("admin overview (Day 21)", () => {
  it("counts objects per status under the user's own permissions", async () => {
    const counts = await loadObjectStatusCounts(
      client({ "heritage_objects:draft": 5, "heritage_objects:published": 891 }),
    );
    expect(counts).toEqual({ draft: 5, review: 0, published: 891, archived: 0 });
  });

  it("returns null rather than a partial picture when a query fails", async () => {
    expect(await loadObjectStatusCounts(client({}, "review"))).toBeNull();
    expect(await loadStaffCounts(client({}, "editor"))).toBeNull();
  });

  it("counts staff per role", async () => {
    expect(
      await loadStaffCounts(
        client({ "staff_members:editor": 3, "staff_members:administrator": 1 }),
      ),
    ).toEqual({ editor: 3, administrator: 1 });
  });
});
