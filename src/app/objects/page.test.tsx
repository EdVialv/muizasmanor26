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
const { createDirectoryDataSourceFromEnv } = vi.hoisted(() => ({
  createDirectoryDataSourceFromEnv: vi.fn(),
}));
vi.mock("@/lib/directory/supabaseDataSource", () => ({ createDirectoryDataSourceFromEnv }));

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

async function renderObjectsPage(searchParams: { cursor?: string } = {}) {
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
});
