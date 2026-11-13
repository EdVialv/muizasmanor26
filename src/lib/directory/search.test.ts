import { describe, expect, it, vi } from "vitest";
import type { DirectoryCursor } from "./cursor";
import { DirectoryQueryError, type RawDirectoryRow } from "./queries";
import { fetchSearchPage, type DirectorySearchDataSource } from "./search";
import { searchScope } from "./searchQuery";

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function row(name: string, id: string): RawDirectoryRow {
  return {
    id,
    slug: `objekts-${id.slice(-4)}`,
    name_lv: name,
    object_type: "manor_estate",
    municipality: null,
    condition_category: null,
    ownership_type: null,
  };
}

function sourceReturning(rows: RawDirectoryRow[]) {
  const searchPublishedObjects = vi.fn<DirectorySearchDataSource["searchPublishedObjects"]>(
    async () => rows,
  );
  return { searchPublishedObjects };
}

describe("fetchSearchPage", () => {
  it("passes the normalised query, no cursor and pageSize + 1 to the data source", async () => {
    const source = sourceReturning([]);

    await fetchSearchPage(source, "  Rundāles   pils ", null, 24);

    expect(source.searchPublishedObjects).toHaveBeenCalledWith("Rundāles pils", null, 25);
  });

  it("returns a page and a next cursor scoped to this search", async () => {
    const rows = [row("A", ID(1)), row("B", ID(2)), row("C", ID(3))];
    const result = await fetchSearchPage(sourceReturning(rows), "muiža", null, 2);

    expect(result.items.map((item) => item.nameLv)).toEqual(["A", "B"]);
    expect(result.hasNextPage).toBe(true);
    expect(result.nextCursor).toEqual({ name: "B", id: ID(2), scope: searchScope("muiža") });
  });

  it("returns no next cursor on the last page", async () => {
    const result = await fetchSearchPage(sourceReturning([row("A", ID(1))]), "muiža", null, 2);

    expect(result.hasNextPage).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it("passes a matching cursor through as the keyset position", async () => {
    const source = sourceReturning([]);
    const cursor: DirectoryCursor = { name: "A", id: ID(1), scope: searchScope("muiža") };

    await fetchSearchPage(source, "muiža", cursor, 24);

    expect(source.searchPublishedObjects).toHaveBeenCalledWith("muiža", cursor, 25);
  });

  it("refuses a cursor issued for a different search, or for no search", async () => {
    const source = sourceReturning([]);

    await expect(
      fetchSearchPage(source, "muiža", { name: "A", id: ID(1), scope: searchScope("pils") }),
    ).rejects.toThrow(RangeError);
    await expect(fetchSearchPage(source, "muiža", { name: "A", id: ID(1) })).rejects.toThrow(
      RangeError,
    );
    expect(source.searchPublishedObjects).not.toHaveBeenCalled();
  });

  it("refuses a blank query and an invalid page size without querying", async () => {
    const source = sourceReturning([]);

    await expect(fetchSearchPage(source, "   ", null)).rejects.toThrow(RangeError);
    await expect(fetchSearchPage(source, "muiža", null, 0)).rejects.toThrow(RangeError);
    expect(source.searchPublishedObjects).not.toHaveBeenCalled();
  });

  it("wraps a data-source failure in DirectoryQueryError", async () => {
    const source = {
      searchPublishedObjects: vi.fn(async () => {
        throw new Error("function search_public_heritage_objects does not exist");
      }),
    };

    await expect(fetchSearchPage(source, "muiža", null)).rejects.toBeInstanceOf(
      DirectoryQueryError,
    );
  });
});
