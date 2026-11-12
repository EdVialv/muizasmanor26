import { describe, expect, it } from "vitest";
import {
  DirectoryQueryError,
  fetchDirectoryPage,
  type DirectoryDataSource,
  type RawDirectoryRow,
} from "./queries";

function row(name: string, id: string): RawDirectoryRow {
  return {
    id,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    name_lv: name,
    object_type: "manor_estate",
    municipality: "Testu novads",
    condition_category: null,
    ownership_type: null,
  };
}

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/**
 * A fake DirectoryDataSource over an in-memory, already-known fixture,
 * implementing exactly the three contracts fetchDirectoryPage depends on.
 * This is the "injected data-access function" the Day 13 brief requires
 * tests to use instead of a live Supabase project - see
 * docs/DAY13_DIRECTORY_NOTES.md.
 */
function fakeDataSource(fixture: RawDirectoryRow[]): DirectoryDataSource {
  const sorted = [...fixture].sort((a, b) =>
    a.name_lv === b.name_lv ? a.id.localeCompare(b.id) : a.name_lv.localeCompare(b.name_lv),
  );
  return {
    async fetchFirstPage(limit) {
      return sorted.slice(0, limit);
    },
    async fetchSameNameAfterId(name, afterId, limit) {
      return sorted.filter((r) => r.name_lv === name && r.id > afterId).slice(0, limit);
    },
    async fetchAfterName(name, limit) {
      return sorted.filter((r) => r.name_lv > name).slice(0, limit);
    },
  };
}

describe("fetchDirectoryPage", () => {
  it("returns the first page in deterministic (name, id) order, enforcing the page size", async () => {
    const fixture = [row("Beta", ID(2)), row("Alpha", ID(1)), row("Gamma", ID(3))];
    const dataSource = fakeDataSource(fixture);

    const result = await fetchDirectoryPage(dataSource, null, 2);

    expect(result.items.map((i) => i.nameLv)).toEqual(["Alpha", "Beta"]);
    expect(result.hasNextPage).toBe(true);
    expect(result.nextCursor).toEqual({ name: "Beta", id: ID(2) });
  });

  it("reports no next page and no cursor when every row fits on one page", async () => {
    const fixture = [row("Alpha", ID(1)), row("Beta", ID(2))];
    const dataSource = fakeDataSource(fixture);

    const result = await fetchDirectoryPage(dataSource, null, 24);

    expect(result.items).toHaveLength(2);
    expect(result.hasNextPage).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it("never requests more than pageSize + 1 rows from the data source", async () => {
    let requestedLimit: number | undefined;
    const dataSource: DirectoryDataSource = {
      async fetchFirstPage(limit) {
        requestedLimit = limit;
        return [];
      },
      async fetchSameNameAfterId() {
        return [];
      },
      async fetchAfterName() {
        return [];
      },
    };

    await fetchDirectoryPage(dataSource, null, 24);

    expect(requestedLimit).toBe(25);
  });

  it("walks past a name boundary using the same-name tail then the after-name page, in order", async () => {
    // Two rows share the cursor's exact name ("Alpha"); the cursor points at
    // the first of them, so the correct next page is: the second "Alpha"
    // row, then every "Beta"/"Gamma" row - never the reverse, and never a
    // row with the same name but a smaller id.
    const fixture = [
      row("Alpha", ID(1)),
      row("Alpha", ID(2)),
      row("Beta", ID(3)),
      row("Gamma", ID(4)),
    ];
    const dataSource = fakeDataSource(fixture);

    const result = await fetchDirectoryPage(dataSource, { name: "Alpha", id: ID(1) }, 2);

    expect(result.items.map((i) => i.id)).toEqual([ID(2), ID(3)]);
    expect(result.hasNextPage).toBe(true);
    expect(result.nextCursor).toEqual({ name: "Beta", id: ID(3) });
  });

  it("is independent of the fixture's insertion order (deterministic ordering)", async () => {
    const inOneOrder = [row("Gamma", ID(3)), row("Alpha", ID(1)), row("Beta", ID(2))];
    const inAnotherOrder = [row("Beta", ID(2)), row("Gamma", ID(3)), row("Alpha", ID(1))];

    const resultA = await fetchDirectoryPage(fakeDataSource(inOneOrder), null, 24);
    const resultB = await fetchDirectoryPage(fakeDataSource(inAnotherOrder), null, 24);

    expect(resultA.items.map((i) => i.id)).toEqual(resultB.items.map((i) => i.id));
    expect(resultA.items.map((i) => i.id)).toEqual([ID(1), ID(2), ID(3)]);
  });

  it("maps a raw row onto the presentation shape, including a null publicAccessStatus", async () => {
    const fixture = [row("Alpha", ID(1))];
    const result = await fetchDirectoryPage(fakeDataSource(fixture), null, 24);

    expect(result.items[0]).toEqual({
      id: ID(1),
      slug: "alpha",
      nameLv: "Alpha",
      objectType: "manor_estate",
      municipality: "Testu novads",
      conditionCategory: null,
      ownershipType: null,
      publicAccessStatus: null,
    });
  });

  it("rejects a non-positive or non-integer page size rather than silently clamping it", async () => {
    const dataSource = fakeDataSource([]);
    await expect(fetchDirectoryPage(dataSource, null, 0)).rejects.toThrow(RangeError);
    await expect(fetchDirectoryPage(dataSource, null, -1)).rejects.toThrow(RangeError);
    await expect(fetchDirectoryPage(dataSource, null, 1.5)).rejects.toThrow(RangeError);
  });

  it("wraps a data-source failure in DirectoryQueryError rather than letting it propagate raw", async () => {
    const dataSource: DirectoryDataSource = {
      async fetchFirstPage() {
        throw new Error("connection refused");
      },
      async fetchSameNameAfterId() {
        return [];
      },
      async fetchAfterName() {
        return [];
      },
    };

    await expect(fetchDirectoryPage(dataSource, null, 24)).rejects.toBeInstanceOf(
      DirectoryQueryError,
    );
  });
});
