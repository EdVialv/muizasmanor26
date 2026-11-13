import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeCursor } from "@/lib/directory/cursor";
import type { ObjectDetailDataSource, RawRelatedObjectRow } from "@/lib/objects/detail";

const { createObjectDetailDataSourceFromEnv } = vi.hoisted(() => ({
  createObjectDetailDataSourceFromEnv: vi.fn(),
}));
vi.mock("@/lib/objects/supabaseDetailDataSource", () => ({ createObjectDetailDataSourceFromEnv }));

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function related(n: number, name: string, type = "outbuilding"): RawRelatedObjectRow {
  return { id: ID(n), slug: `objekts-${n}`, name_lv: name, object_type: type };
}

function dataSource(overrides: Partial<ObjectDetailDataSource> = {}): ObjectDetailDataSource {
  return {
    fetchPublishedObjectBySlug: vi.fn(async () => null),
    fetchPublishedObjectById: vi.fn(async () => null),
    fetchPublishedChildren: vi.fn(async () => []),
    fetchVerifiedOwnerFamilies: vi.fn(async () => []),
    ...overrides,
  };
}

async function renderSection(
  object: { id: string; parentObjectId: string | null },
  context: { cursor?: string } = {},
) {
  const { default: ObjectRelationsSection } = await import("./ObjectRelationsSection");
  const element = await ObjectRelationsSection({ object, context });
  return render(element);
}

describe("ObjectRelationsSection", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("links to the parent object and to each child, with their types", async () => {
    createObjectDetailDataSourceFromEnv.mockReturnValue(
      dataSource({
        fetchPublishedObjectById: vi.fn(async () =>
          related(9, "Rundāles pils", "palace_or_castle"),
        ),
        fetchPublishedChildren: vi.fn(async () => [
          related(2, "Franču dārzs", "park_or_garden"),
          related(3, "Rietumu stallis"),
        ]),
      }),
    );

    await renderSection({ id: ID(1), parentObjectId: ID(9) });

    expect(screen.getByRole("link", { name: "Rundāles pils" })).toHaveAttribute(
      "href",
      "/objects/objekts-9",
    );
    expect(screen.getByRole("link", { name: "Franču dārzs" })).toHaveAttribute(
      "href",
      "/objects/objekts-2",
    );
    expect(screen.getByRole("link", { name: "Rietumu stallis" })).toHaveAttribute(
      "href",
      "/objects/objekts-3",
    );
    expect(screen.getByText("Pils")).toBeInTheDocument();
    expect(screen.getByText("Parks vai dārzs")).toBeInTheDocument();
    expect(screen.getByText("Palīgēka")).toBeInTheDocument();
  });

  it("keeps the directory context on related-object links", async () => {
    const token = encodeCursor({ name: "Mežotnes pils", id: ID(5) });
    createObjectDetailDataSourceFromEnv.mockReturnValue(
      dataSource({ fetchPublishedChildren: vi.fn(async () => [related(2, "Franču dārzs")]) }),
    );

    await renderSection({ id: ID(1), parentObjectId: null }, { cursor: token });

    expect(screen.getByRole("link", { name: "Franču dārzs" })).toHaveAttribute(
      "href",
      `/objects/objekts-2?from=${token}`,
    );
  });

  it("lists verified historical owner families with approximate periods", async () => {
    createObjectDetailDataSourceFromEnv.mockReturnValue(
      dataSource({
        fetchVerifiedOwnerFamilies: vi.fn(async () => [
          { family_name: "von Biron", start_year_approx: 1735, end_year_approx: 1795 },
          { family_name: "Zubov", start_year_approx: 1795, end_year_approx: null },
          { family_name: "Shuvalov", start_year_approx: null, end_year_approx: null },
        ]),
      }),
    );

    await renderSection({ id: ID(1), parentObjectId: null });

    expect(screen.getByRole("heading", { name: "Vēsturiskie īpašnieki" })).toBeInTheDocument();
    expect(screen.getByText("ap 1735–1795")).toBeInTheDocument();
    expect(screen.getByText("no ap 1795")).toBeInTheDocument();
    expect(screen.getByText("Shuvalov")).toBeInTheDocument();
  });

  it("renders nothing at all for an object with no relations and no families", async () => {
    createObjectDetailDataSourceFromEnv.mockReturnValue(dataSource());

    const { container } = await renderSection({ id: ID(1), parentObjectId: null });

    expect(container).toBeEmptyDOMElement();
  });

  it("omits the parent group when the parent is not published", async () => {
    createObjectDetailDataSourceFromEnv.mockReturnValue(
      dataSource({ fetchPublishedChildren: vi.fn(async () => [related(2, "Franču dārzs")]) }),
    );

    await renderSection({ id: ID(1), parentObjectId: ID(9) });

    expect(screen.queryByText("Ietilpst kompleksā")).not.toBeInTheDocument();
    expect(screen.getByText("Šim objektam piederīgie objekti")).toBeInTheDocument();
  });

  it("contains a failure to a short notice, without leaking the cause", async () => {
    createObjectDetailDataSourceFromEnv.mockReturnValue(
      dataSource({
        fetchPublishedChildren: vi.fn(async () => {
          throw new Error("connect ECONNREFUSED 10.0.0.5:5432");
        }),
      }),
    );

    await renderSection({ id: ID(1), parentObjectId: null });

    expect(screen.getByRole("status")).toHaveTextContent(/neizdevās ielādēt/i);
    expect(screen.queryByText(/ECONNREFUSED|10\.0\.0\.5/)).not.toBeInTheDocument();
  });
});
