import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EMPTY_FILTERS, type DirectoryFilters } from "@/lib/directory/filters";
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

async function renderObjectsPage(searchParams: Record<string, string | string[]> = {}) {
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

/** A directory row plus the recorded service flags the database filters on. */
type FakeRow = RawDirectoryRow & {
  offers_accommodation?: boolean | null;
  offers_catering?: boolean | null;
  offers_event_facilities?: boolean | null;
};

/**
 * Mirrors search_public_heritage_objects closely enough to test the page:
 * every search term must occur (case- and diacritic-insensitively); within a
 * filter category any value may match (OR); categories and services are
 * ANDed; a service matches only when recorded true.
 */
function fakeSearchSource(fixture: FakeRow[]) {
  const sorted = [...fixture].sort((a, b) =>
    a.name_lv === b.name_lv ? a.id.localeCompare(b.id) : a.name_lv.localeCompare(b.name_lv),
  );
  const calls: Array<{
    query: string | null;
    filters: DirectoryFilters;
    after: { name: string; id: string } | null;
    limit: number;
  }> = [];
  return {
    calls,
    searchPublishedObjects: vi.fn(
      async (
        query: string | null,
        filters: DirectoryFilters,
        after: { name: string; id: string } | null,
        limit: number,
      ) => {
        calls.push({ query, filters, after, limit });
        const terms = query ? fold(query).split(" ") : [];
        return sorted
          .filter((r) =>
            terms.every((t) => fold(`${r.name_lv} ${r.municipality ?? ""}`).includes(t)),
          )
          .filter(
            (r) => filters.types.length === 0 || filters.types.includes(r.object_type as never),
          )
          .filter(
            (r) => filters.regions.length === 0 || filters.regions.includes(r.municipality ?? ""),
          )
          .filter(
            (r) => filters.access.length === 0 || filters.access.includes(r.public_access as never),
          )
          .filter(
            (r) => !filters.services.includes("accommodation") || r.offers_accommodation === true,
          )
          .filter((r) => !filters.services.includes("catering") || r.offers_catering === true)
          .filter((r) => !filters.services.includes("events") || r.offers_event_facilities === true)
          .filter(
            (r) =>
              !after || r.name_lv > after.name || (r.name_lv === after.name && r.id > after.id),
          )
          .slice(0, limit)
          .map(
            (r) =>
              Object.fromEntries(
                Object.entries(r).filter(([key]) => !key.startsWith("offers_")),
              ) as RawDirectoryRow,
          );
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
    expect(search.calls).toEqual([
      { query: "rundales", filters: EMPTY_FILTERS, after: null, limit: 25 },
    ]);
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

describe("ObjectsPage filters (Day 17)", () => {
  // A small, fully known fixture. Services: true = recorded as offered,
  // false = recorded as not offered, null = not recorded.
  function fixture(): FakeRow[] {
    const base = (n: number, name: string, extra: Partial<FakeRow>): FakeRow => ({
      ...row(name, ID(n)),
      slug: `obj-${n}`,
      ...extra,
    });
    return [
      base(1, "Alfa pils", {
        object_type: "palace_or_castle",
        municipality: "Cēsu novads",
        public_access: "open",
        offers_accommodation: true,
        offers_catering: true,
        offers_event_facilities: true,
      }),
      base(2, "Beta muiža", {
        object_type: "manor_estate",
        municipality: "Cēsu novads",
        public_access: "by_appointment",
        offers_accommodation: true,
        offers_catering: false,
        offers_event_facilities: null,
      }),
      base(3, "Gamma muiža", {
        object_type: "manor_estate",
        municipality: "Bauskas novads",
        public_access: null,
        offers_accommodation: null,
        offers_catering: true,
        offers_event_facilities: true,
      }),
      base(4, "Delta drupas", {
        object_type: "ruin_or_historical_site",
        municipality: "Bauskas novads",
        public_access: "exterior_only",
        offers_accommodation: false,
        offers_catering: null,
        offers_event_facilities: false,
      }),
    ];
  }

  async function namesFor(params: Record<string, string | string[]>) {
    document.body.innerHTML = "";
    createDirectorySearchDataSourceFromEnv.mockReturnValue(fakeSearchSource(fixture()));
    await renderObjectsPage(params);
    return screen.queryAllByRole("link", { name: /pils|muiža|drupas/ }).map((l) => l.textContent);
  }

  it("filters by object type", async () => {
    expect(await namesFor({ type: "manor_estate" })).toEqual(["Beta muiža", "Gamma muiža"]);
  });

  it("filters by region (stored municipality, exact)", async () => {
    expect(await namesFor({ region: "Bauskas novads" })).toEqual(["Delta drupas", "Gamma muiža"]);
  });

  it("filters by public access", async () => {
    expect(await namesFor({ access: "exterior_only" })).toEqual(["Delta drupas"]);
  });

  it("filters by each service, matching only objects recorded as offering it", async () => {
    expect(await namesFor({ service: "accommodation" })).toEqual(["Alfa pils", "Beta muiža"]);
    expect(await namesFor({ service: "catering" })).toEqual(["Alfa pils", "Gamma muiža"]);
    expect(await namesFor({ service: "events" })).toEqual(["Alfa pils", "Gamma muiža"]);
  });

  it("treats missing service and access data as unknown, never as a match", async () => {
    // Gamma has no recorded accommodation; Beta none for events; Gamma no access.
    expect(await namesFor({ service: "accommodation" })).not.toContain("Gamma muiža");
    expect(await namesFor({ service: "events" })).not.toContain("Beta muiža");
    expect(
      await namesFor({ access: ["open", "by_appointment", "exterior_only", "not_accessible"] }),
    ).not.toContain("Gamma muiža");
  });

  it("ORs values within one category", async () => {
    expect(await namesFor({ type: ["palace_or_castle", "ruin_or_historical_site"] })).toEqual([
      "Alfa pils",
      "Delta drupas",
    ]);
    expect(await namesFor({ access: ["open", "exterior_only"] })).toEqual([
      "Alfa pils",
      "Delta drupas",
    ]);
  });

  it("ANDs different categories, and services independently", async () => {
    expect(await namesFor({ type: "manor_estate", region: "Cēsu novads" })).toEqual(["Beta muiža"]);
    expect(await namesFor({ service: ["accommodation", "catering"] })).toEqual(["Alfa pils"]);
    expect(await namesFor({ service: ["catering", "events"], region: "Bauskas novads" })).toEqual([
      "Gamma muiža",
    ]);
  });

  it("applies search and several filters in the same request", async () => {
    const search = fakeSearchSource(fixture());
    createDirectorySearchDataSourceFromEnv.mockReturnValue(search);
    document.body.innerHTML = "";

    await renderObjectsPage({ q: "muiža", region: "Cēsu novads", service: "accommodation" });

    expect(search.calls).toHaveLength(1);
    expect(search.calls[0]).toMatchObject({
      query: "muiža",
      filters: { types: [], regions: ["Cēsu novads"], access: [], services: ["accommodation"] },
    });
    expect(screen.getAllByRole("link", { name: /muiža/ }).map((l) => l.textContent)).toEqual([
      "Beta muiža",
    ]);
    expect(
      screen.getByRole("heading", { name: /meklēšanas rezultāti: „muiža”, ar filtriem/i }),
    ).toBeInTheDocument();
  });

  it("ignores invalid filter values, says so, and still applies the valid ones", async () => {
    const names = await namesFor({ type: ["castle", "manor_estate"], service: "spa" });
    expect(names).toEqual(["Beta muiža", "Gamma muiža"]);
    expect(screen.getByText(/daži saites filtri nebija derīgi/i)).toBeInTheDocument();
  });

  it("shows the plain directory when every filter value is invalid", async () => {
    createDirectoryDataSourceFromEnv.mockReturnValue(fakeDataSource([row("Alfa muiža", ID(1))]));
    createDirectorySearchDataSourceFromEnv.mockReset();
    document.body.innerHTML = "";

    await renderObjectsPage({ type: "castle", access: "state" });

    expect(createDirectorySearchDataSourceFromEnv).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Alfa muiža" })).toBeInTheDocument();
  });

  it("shows a no-results state that keeps the search when clearing filters", async () => {
    await namesFor({ q: "pils", type: "outbuilding" });

    expect(
      screen.getByRole("heading", { name: /neviens objekts neatbilst izvēlētajiem filtriem/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/informācija vēl nav reģistrēta/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Notīrīt filtrus, paturēt meklēšanu" }),
    ).toHaveAttribute("href", "/objects?q=pils");
  });

  it("keeps the search and every filter on the next-page link, with a cursor scoped to them", async () => {
    const { decodeCursor } = await import("@/lib/directory/cursor");
    const { listingScope } = await import("@/lib/directory/filters");
    const many: FakeRow[] = Array.from({ length: 30 }, (_, i) => ({
      ...row(`Muiža ${String(i).padStart(2, "0")}`, ID(i)),
      slug: `m-${i}`,
      object_type: "manor_estate",
      offers_catering: true,
    }));
    createDirectorySearchDataSourceFromEnv.mockReturnValue(fakeSearchSource(many));
    document.body.innerHTML = "";

    await renderObjectsPage({ q: "muiža", type: "manor_estate", service: "catering" });

    const href = screen.getByRole("link", { name: "Nākamā lapa" }).getAttribute("href") ?? "";
    const url = new URL(href, "http://localhost");
    expect(url.searchParams.get("q")).toBe("muiža");
    expect(url.searchParams.getAll("type")).toEqual(["manor_estate"]);
    expect(url.searchParams.getAll("service")).toEqual(["catering"]);
    expect(decodeCursor(url.searchParams.get("cursor"))?.scope).toBe(
      listingScope({
        q: "muiža",
        filters: { types: ["manor_estate"], regions: [], access: [], services: ["catering"] },
      }),
    );
  });

  it("walks every filtered page with no duplicate and no skipped result", async () => {
    const many: FakeRow[] = Array.from({ length: 70 }, (_, i) => ({
      ...row(`Muiža ${String(Math.floor(i / 2)).padStart(2, "0")}`, ID(i)),
      slug: `m-${i}`,
      offers_accommodation: i % 2 === 0 ? true : null,
    }));
    createDirectorySearchDataSourceFromEnv.mockReturnValue(fakeSearchSource(many));

    const seen: string[] = [];
    let params: Record<string, string> = { service: "accommodation" };
    for (let page = 0; page < 10; page += 1) {
      document.body.innerHTML = "";
      await renderObjectsPage(params);
      for (const link of screen.getAllByRole("link", { name: /^Muiža/ })) {
        seen.push(new URL(link.getAttribute("href") ?? "", "http://localhost").pathname);
      }
      const next = screen.queryByRole("link", { name: "Nākamā lapa" });
      if (!next) {
        break;
      }
      const url = new URL(next.getAttribute("href") ?? "", "http://localhost");
      params = Object.fromEntries(url.searchParams.entries());
    }

    expect(seen).toHaveLength(35);
    expect(new Set(seen).size).toBe(35);
  });

  it("refuses a cursor from a different filter set: first page, with a notice", async () => {
    const { encodeCursor } = await import("@/lib/directory/cursor");
    const { listingScope } = await import("@/lib/directory/filters");
    const search = fakeSearchSource(fixture());
    createDirectorySearchDataSourceFromEnv.mockReturnValue(search);
    document.body.innerHTML = "";
    const otherFilters = { types: [], regions: [], access: [], services: ["catering" as const] };
    const staleCursor = encodeCursor({
      name: "Alfa pils",
      id: ID(1),
      scope: listingScope({ q: null, filters: otherFilters }),
    });

    await renderObjectsPage({ service: "accommodation", cursor: staleCursor });

    expect(search.calls[0].after).toBeNull();
    expect(screen.getByText(/saite uz šo lapu bija nederīga/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Alfa pils" })).toBeInTheDocument();
  });

  it("refuses a search-only cursor once a filter is added", async () => {
    const { encodeCursor } = await import("@/lib/directory/cursor");
    const { searchScope } = await import("@/lib/directory/searchQuery");
    const search = fakeSearchSource(fixture());
    createDirectorySearchDataSourceFromEnv.mockReturnValue(search);
    document.body.innerHTML = "";

    await renderObjectsPage({
      q: "muiža",
      type: "manor_estate",
      cursor: encodeCursor({ name: "Beta muiža", id: ID(2), scope: searchScope("muiža") }),
    });

    expect(search.calls[0].after).toBeNull();
    expect(screen.getByText(/saite uz šo lapu bija nederīga/i)).toBeInTheDocument();
  });

  it("gives result cards the whole listing so the object page can link back to it", async () => {
    await namesFor({ q: "muiža", type: "manor_estate", service: "catering" });

    const href = screen.getByRole("link", { name: "Gamma muiža" }).getAttribute("href") ?? "";
    const url = new URL(href, "http://localhost");
    expect(url.searchParams.get("fromQ")).toBe("muiža");
    expect(url.searchParams.get("fromFilters")).toBe("type=manor_estate&service=catering");
  });
});
