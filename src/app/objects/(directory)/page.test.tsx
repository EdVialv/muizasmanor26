import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  DirectoryConfigurationError,
  DirectoryQueryError,
  type DirectoryDataSource,
  type RawDirectoryRow,
} from "@/lib/directory/queries";

/**
 * ObjectsPage talks to Supabase only through
 * createDirectoryDataSourceFromEnv (src/lib/directory/supabaseDataSource.ts)
 * - mocking that one function is the "injected data-access function" seam
 * this test needs, exactly per the Day 13 requirement that tests must not
 * depend on real Supabase environment variables.
 */
const { createDirectoryDataSourceFromEnv, createDirectorySearchDataSourceFromEnv } = vi.hoisted(
  () => ({
    createDirectoryDataSourceFromEnv: vi.fn(),
    createDirectorySearchDataSourceFromEnv: vi.fn(),
  }),
);
vi.mock("@/lib/directory/supabaseDataSource", () => ({ createDirectoryDataSourceFromEnv }));
// Day 16: searches go through their own data source, mocked the same way.
vi.mock("@/lib/directory/supabaseSearchDataSource", () => ({
  createDirectorySearchDataSourceFromEnv,
}));

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

async function renderObjectsPage(
  searchParams: { cursor?: string | string[]; q?: string | string[] } = {},
) {
  const { default: ObjectsPage } = await import("./page");
  const element = await ObjectsPage({ searchParams: Promise.resolve(searchParams) });
  render(element);
}

describe("ObjectsPage", () => {
  it("renders the normal result state: one card per object, in deterministic order", async () => {
    createDirectoryDataSourceFromEnv.mockReturnValue(
      fakeDataSource([row("Beta muiža", ID(2)), row("Alfa muiža", ID(1))]),
    );

    await renderObjectsPage();

    const links = screen.getAllByRole("link", { name: /muiža$/ });
    expect(links.map((l) => l.textContent)).toEqual(["Alfa muiža", "Beta muiža"]);
  });

  it("renders the empty state when there are no published objects, without fabricating any", async () => {
    createDirectoryDataSourceFromEnv.mockReturnValue(fakeDataSource([]));

    await renderObjectsPage();

    expect(screen.getByText(/pagaidām nav publicētu objektu/i)).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("renders a safe, generic error state when the data source is not configured, without leaking the real message", async () => {
    createDirectoryDataSourceFromEnv.mockImplementation(() => {
      throw new DirectoryConfigurationError(
        "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must both be set",
      );
    });

    await renderObjectsPage();

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/NEXT_PUBLIC_SUPABASE/)).not.toBeInTheDocument();
  });

  it("renders a safe, generic error state when the query fails, without leaking the underlying cause", async () => {
    const failingDataSource: DirectoryDataSource = {
      async fetchFirstPage() {
        throw new DirectoryQueryError(
          "Failed to fetch the directory page.",
          new Error("pg: connection to 10.0.0.5:5432 refused"),
        );
      },
      async fetchSameNameAfterId() {
        return [];
      },
      async fetchAfterName() {
        return [];
      },
    };
    createDirectoryDataSourceFromEnv.mockReturnValue(failingDataSource);

    await renderObjectsPage();

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/10\.0\.0\.5/)).not.toBeInTheDocument();
    expect(screen.queryByText(/connection/i)).not.toBeInTheDocument();
  });

  it("shows a next-page link when there are more results, carrying the next cursor", async () => {
    const fixture = Array.from({ length: 30 }, (_, i) =>
      row(`Muiža ${String(i).padStart(2, "0")}`, ID(i)),
    );
    createDirectoryDataSourceFromEnv.mockReturnValue(fakeDataSource(fixture));

    await renderObjectsPage();

    const nextLink = screen.getByRole("link", { name: "Nākamā lapa" });
    expect(nextLink.getAttribute("href")).toMatch(/^\/objects\?cursor=/);
  });

  it("does not show a next-page link when every result fits on one page", async () => {
    createDirectoryDataSourceFromEnv.mockReturnValue(fakeDataSource([row("Vienīgā muiža", ID(1))]));

    await renderObjectsPage();

    expect(screen.queryByRole("link", { name: "Nākamā lapa" })).not.toBeInTheDocument();
  });

  it("falls back to the first page and shows a notice when the cursor is malformed, instead of erroring", async () => {
    createDirectoryDataSourceFromEnv.mockReturnValue(fakeDataSource([row("A", ID(1))]));

    await renderObjectsPage({ cursor: "not-a-valid-cursor-token" });

    expect(screen.getByText(/saite uz šo lapu bija nederīga/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "A" })).toBeInTheDocument();
  });

  it("links first-page cards straight to their object pages", async () => {
    createDirectoryDataSourceFromEnv.mockReturnValue(fakeDataSource([row("Alfa muiža", ID(1))]));

    await renderObjectsPage();

    expect(screen.getByRole("link", { name: "Alfa muiža" })).toHaveAttribute(
      "href",
      "/objects/alfa-mui%C5%BEa",
    );
  });

  it("gives cards on a later page the current cursor, so the object page can link back to it", async () => {
    const { encodeCursor } = await import("@/lib/directory/cursor");
    const token = encodeCursor({ name: "Alfa muiža", id: ID(1) });
    createDirectoryDataSourceFromEnv.mockReturnValue(
      fakeDataSource([row("Alfa muiža", ID(1)), row("Beta muiža", ID(2))]),
    );

    await renderObjectsPage({ cursor: token });

    expect(screen.getByRole("link", { name: "Beta muiža" }).getAttribute("href")).toMatch(
      new RegExp(`\\?from=${token}$`),
    );
  });

  it("does not pass an invalid cursor on to card links", async () => {
    createDirectoryDataSourceFromEnv.mockReturnValue(fakeDataSource([row("Alfa muiža", ID(1))]));

    await renderObjectsPage({ cursor: "not-a-valid-cursor-token" });

    expect(screen.getByRole("link", { name: "Alfa muiža" }).getAttribute("href")).not.toContain(
      "from=",
    );
  });
});

/**
 * Day 16 search. The fake search source does what the database function
 * does, closely enough to test the page: case- and diacritic-insensitive
 * substring match of every term, (name_lv, id) order, keyset "after".
 */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function fakeSearchSource(fixture: RawDirectoryRow[]) {
  const sorted = [...fixture].sort((a, b) =>
    a.name_lv === b.name_lv ? a.id.localeCompare(b.id) : a.name_lv.localeCompare(b.name_lv),
  );
  const calls: Array<{ query: string; after: { name: string; id: string } | null; limit: number }> =
    [];
  return {
    calls,
    searchPublishedObjects: vi.fn(
      async (query: string, after: { name: string; id: string } | null, limit: number) => {
        calls.push({ query, after, limit });
        const terms = fold(query).split(" ");
        return sorted
          .filter((r) =>
            terms.every((t) => fold(`${r.name_lv} ${r.municipality ?? ""}`).includes(t)),
          )
          .filter(
            (r) =>
              !after || r.name_lv > after.name || (r.name_lv === after.name && r.id > after.id),
          )
          .slice(0, limit);
      },
    ),
  };
}

describe("ObjectsPage search (Day 16)", () => {
  it("searches through the search data source, not the plain directory", async () => {
    const search = fakeSearchSource([row("Rundāles pils", ID(1)), row("Cēsu pils", ID(2))]);
    createDirectorySearchDataSourceFromEnv.mockReturnValue(search);
    createDirectoryDataSourceFromEnv.mockReset();

    await renderObjectsPage({ q: "rundales" });

    expect(createDirectoryDataSourceFromEnv).not.toHaveBeenCalled();
    expect(search.calls).toEqual([{ query: "rundales", after: null, limit: 25 }]);
    expect(screen.getByRole("link", { name: "Rundāles pils" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Cēsu pils" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /meklēšanas rezultāti: „rundales”/i }),
    ).toBeInTheDocument();
  });

  it("normalises the query from the URL before searching (whitespace collapsed and trimmed)", async () => {
    const search = fakeSearchSource([row("Rundāles pils", ID(1))]);
    createDirectorySearchDataSourceFromEnv.mockReturnValue(search);

    await renderObjectsPage({ q: "   Rundāles \t  pils  " });

    expect(search.calls[0].query).toBe("Rundāles pils");
  });

  it("treats a blank or repeated q as no search, showing the plain directory", async () => {
    createDirectoryDataSourceFromEnv.mockReturnValue(fakeDataSource([row("Alfa muiža", ID(1))]));
    createDirectorySearchDataSourceFromEnv.mockReset();

    await renderObjectsPage({ q: "   " });
    await renderObjectsPage({ q: ["a", "b"] });

    expect(createDirectorySearchDataSourceFromEnv).not.toHaveBeenCalled();
    expect(screen.getAllByRole("link", { name: "Alfa muiža" })).toHaveLength(2);
  });

  it("shows a no-match state naming the query, with a way back to the full directory", async () => {
    createDirectorySearchDataSourceFromEnv.mockReturnValue(
      fakeSearchSource([row("Alfa muiža", ID(1))]),
    );

    await renderObjectsPage({ q: "zzzqqq" });

    expect(screen.getByRole("heading", { name: "Nekas netika atrasts" })).toBeInTheDocument();
    expect(screen.getByText(/pēc „zzzqqq” nav atrasts/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Rādīt visu katalogu" })).toHaveAttribute(
      "href",
      "/objects",
    );
    expect(screen.queryByText(/pagaidām nav publicētu objektu/i)).not.toBeInTheDocument();
  });

  it("shows a search-specific error state without leaking the cause (e.g. the migration is missing)", async () => {
    createDirectorySearchDataSourceFromEnv.mockReturnValue({
      searchPublishedObjects: vi.fn(async () => {
        throw new Error("Could not find the function public.search_public_heritage_objects");
      }),
    });

    await renderObjectsPage({ q: "rundales" });

    expect(screen.getByRole("alert")).toHaveTextContent(/meklēšana neizdevās/i);
    expect(screen.queryByText(/search_public_heritage_objects/)).not.toBeInTheDocument();
  });

  it("keeps the query on the next-page link, with a cursor scoped to this search", async () => {
    const fixture = Array.from({ length: 30 }, (_, i) =>
      row(`Muiža ${String(i).padStart(2, "0")}`, ID(i)),
    );
    createDirectorySearchDataSourceFromEnv.mockReturnValue(fakeSearchSource(fixture));
    const { decodeCursor } = await import("@/lib/directory/cursor");
    const { searchScope } = await import("@/lib/directory/searchQuery");

    await renderObjectsPage({ q: "muiža" });

    const href = screen.getByRole("link", { name: "Nākamā lapa" }).getAttribute("href") ?? "";
    const url = new URL(href, "http://localhost");
    expect(url.pathname).toBe("/objects");
    expect(url.searchParams.get("q")).toBe("muiža");
    expect(decodeCursor(url.searchParams.get("cursor"))?.scope).toBe(searchScope("muiža"));
  });

  it("walks every search page with no duplicate and no skipped result", async () => {
    const fixture = Array.from({ length: 61 }, (_, i) => ({
      // Repeated names exercise the (name_lv, id) tie-breaker across pages;
      // slugs stay unique so each object can be counted by its own link.
      ...row(`Muiža ${String(Math.floor(i / 3)).padStart(2, "0")}`, ID(i)),
      slug: `muiza-${i}`,
    }));
    fixture.push(row("Cēsu pils", ID(900)));
    createDirectorySearchDataSourceFromEnv.mockReturnValue(fakeSearchSource(fixture));

    const seen: string[] = [];
    let params: { q: string; cursor?: string } = { q: "MUIZA" };
    for (let page = 0; page < 10; page += 1) {
      document.body.innerHTML = "";
      await renderObjectsPage(params);
      for (const link of screen.getAllByRole("link", { name: /^Muiža/ })) {
        // The object's own path; the query string differs per page (`from`).
        seen.push(new URL(link.getAttribute("href") ?? "", "http://localhost").pathname);
      }
      const next = screen.queryByRole("link", { name: "Nākamā lapa" });
      if (!next) {
        break;
      }
      const url = new URL(next.getAttribute("href") ?? "", "http://localhost");
      params = { q: url.searchParams.get("q") ?? "", cursor: url.searchParams.get("cursor") ?? "" };
    }

    expect(seen).toHaveLength(61);
    expect(new Set(seen).size).toBe(61);
  });

  it("refuses a cursor from a different search: first page of this search, with a notice", async () => {
    const { encodeCursor } = await import("@/lib/directory/cursor");
    const { searchScope } = await import("@/lib/directory/searchQuery");
    const search = fakeSearchSource([row("Alfa muiža", ID(1)), row("Beta muiža", ID(2))]);
    createDirectorySearchDataSourceFromEnv.mockReturnValue(search);
    const otherSearchCursor = encodeCursor({
      name: "Alfa muiža",
      id: ID(1),
      scope: searchScope("pils"),
    });

    await renderObjectsPage({ q: "muiža", cursor: otherSearchCursor });

    expect(search.calls[0].after).toBeNull();
    expect(screen.getByText(/saite uz šo lapu bija nederīga/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Alfa muiža" })).toBeInTheDocument();
  });

  it("refuses an unfiltered-directory cursor inside a search", async () => {
    const { encodeCursor } = await import("@/lib/directory/cursor");
    const search = fakeSearchSource([row("Alfa muiža", ID(1)), row("Beta muiža", ID(2))]);
    createDirectorySearchDataSourceFromEnv.mockReturnValue(search);

    await renderObjectsPage({
      q: "muiža",
      cursor: encodeCursor({ name: "Alfa muiža", id: ID(1) }),
    });

    expect(search.calls[0].after).toBeNull();
    expect(screen.getByText(/saite uz šo lapu bija nederīga/i)).toBeInTheDocument();
  });

  it("refuses a search cursor on the unfiltered directory", async () => {
    const { encodeCursor } = await import("@/lib/directory/cursor");
    const { searchScope } = await import("@/lib/directory/searchQuery");
    const plain = fakeDataSource([row("Alfa muiža", ID(1)), row("Beta muiža", ID(2))]);
    createDirectoryDataSourceFromEnv.mockReturnValue(plain);

    await renderObjectsPage({
      cursor: encodeCursor({ name: "Alfa muiža", id: ID(1), scope: searchScope("muiža") }),
    });

    expect(screen.getByText(/saite uz šo lapu bija nederīga/i)).toBeInTheDocument();
    // First page again: Alfa is shown, not skipped.
    expect(screen.getByRole("link", { name: "Alfa muiža" })).toBeInTheDocument();
  });

  it("gives result cards the search (and page) so the object page can link back to them", async () => {
    const { encodeCursor } = await import("@/lib/directory/cursor");
    const { searchScope } = await import("@/lib/directory/searchQuery");
    createDirectorySearchDataSourceFromEnv.mockReturnValue(
      fakeSearchSource([row("Alfa muiža", ID(1)), row("Beta muiža", ID(2))]),
    );
    const token = encodeCursor({ name: "Alfa muiža", id: ID(1), scope: searchScope("muiža") });

    await renderObjectsPage({ q: "muiža", cursor: token });

    const href = screen.getByRole("link", { name: "Beta muiža" }).getAttribute("href") ?? "";
    const url = new URL(href, "http://localhost");
    expect(url.searchParams.get("fromQ")).toBe("muiža");
    expect(url.searchParams.get("from")).toBe(token);
  });
});
