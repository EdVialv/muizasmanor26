import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeCursor } from "@/lib/directory/cursor";
import {
  ObjectDetailQueryError,
  type ObjectDetailDataSource,
  type RawObjectDetailRow,
} from "@/lib/objects/detail";
import { PublicDataConfigurationError } from "@/lib/supabase/publicClient";

/**
 * ObjectPage reaches Supabase only through
 * createObjectDetailDataSourceFromEnv - mocking that one function is the
 * injected data-access seam, so nothing here needs real environment
 * variables (the same approach as the directory's page test).
 */
const { createObjectDetailDataSourceFromEnv, notFound } = vi.hoisted(() => ({
  createObjectDetailDataSourceFromEnv: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/objects/supabaseDetailDataSource", () => ({ createObjectDetailDataSourceFromEnv }));
vi.mock("next/navigation", () => ({ notFound }));
// The relations section is an async Server Component that streams in under
// <Suspense>; it has its own test file. Here it is replaced by a marker that
// shows which object and directory context the page hands it.
vi.mock("./ObjectRelationsSection", () => ({
  default: ({
    object,
    context,
  }: {
    object: { id: string; parentObjectId: string | null };
    context: { cursor?: string };
  }) => (
    <div
      data-testid="relations"
      data-object-id={object.id}
      data-parent-id={object.parentObjectId ?? ""}
      data-cursor={context.cursor ?? ""}
    />
  ),
  ObjectRelationsSkeleton: () => null,
}));

const OBJECT_ID = "11111111-2222-4333-8444-555555555555";
const PARENT_ID = "99999999-2222-4333-8444-555555555555";

function detailRow(overrides: Partial<RawObjectDetailRow> = {}): RawObjectDetailRow {
  return {
    id: OBJECT_ID,
    slug: "rundales-pils-parks",
    name_lv: "Rundāles pils franču dārzs un parks",
    object_type: "park_or_garden",
    summary_lv: "Regulārs franču dārzs pils dienvidu pusē.\n\nIerīkots 18. gadsimtā.",
    municipality: "Bauskas novads (Rundāles pagasts)",
    latitude: 56.4142,
    longitude: 24.0164,
    condition_category: "class_b",
    condition_notes_lv: "Parteris atjaunots.",
    ownership_type: "state",
    parent_object_id: PARENT_ID,
    ...overrides,
  };
}

function dataSourceReturning(row: RawObjectDetailRow | null): ObjectDetailDataSource {
  return {
    fetchPublishedObjectBySlug: vi.fn(async () => row),
    fetchPublishedObjectById: vi.fn(async () => null),
    fetchPublishedChildren: vi.fn(async () => []),
    fetchVerifiedOwnerFamilies: vi.fn(async () => []),
  };
}

async function renderObjectPage(slug: string, searchParams: { from?: string | string[] } = {}) {
  const { default: ObjectPage } = await import("./page");
  const element = await ObjectPage({
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve(searchParams),
  });
  render(element);
}

describe("ObjectPage", () => {
  beforeEach(() => {
    notFound.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("shows the object's name, type, location, description, condition and ownership", async () => {
    createObjectDetailDataSourceFromEnv.mockReturnValue(dataSourceReturning(detailRow()));

    await renderObjectPage("rundales-pils-parks");

    expect(
      screen.getByRole("heading", { level: 1, name: "Rundāles pils franču dārzs un parks" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Parks vai dārzs").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bauskas novads (Rundāles pagasts)").length).toBeGreaterThan(0);
    expect(screen.getByText("Regulārs franču dārzs pils dienvidu pusē.")).toBeInTheDocument();
    expect(screen.getByText("Ierīkots 18. gadsimtā.")).toBeInTheDocument();
    expect(screen.getByText("56.41420, 24.01640")).toBeInTheDocument();
    expect(screen.getByText("B klase")).toBeInTheDocument();
    expect(screen.getByText("Parteris atjaunots.")).toBeInTheDocument();
    expect(screen.getByText("Valsts")).toBeInTheDocument();
  });

  it("explains that class A/B is the platform's own classification, as docs/DATA_MODEL.md requires", async () => {
    createObjectDetailDataSourceFromEnv.mockReturnValue(dataSourceReturning(detailRow()));

    await renderObjectPage("rundales-pils-parks");

    expect(screen.getByText(/iekšēja platformas klasifikācija/i)).toBeInTheDocument();
  });

  it("renders a sparse record cleanly: no empty rows, no placeholder text", async () => {
    createObjectDetailDataSourceFromEnv.mockReturnValue(
      dataSourceReturning(
        detailRow({
          summary_lv: null,
          municipality: null,
          latitude: null,
          longitude: null,
          condition_category: null,
          condition_notes_lv: null,
          ownership_type: null,
          parent_object_id: null,
        }),
      ),
    );

    await renderObjectPage("rundales-pils-parks");

    expect(
      screen.getByRole("heading", { level: 1, name: "Rundāles pils franču dārzs un parks" }),
    ).toBeInTheDocument();
    for (const label of [
      "Apraksts",
      "Atrašanās vieta",
      "Koordinātas",
      "Stāvoklis",
      "Īpašuma forma",
    ]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/nav zināms|nav norādīts|—/i)).not.toBeInTheDocument();
    // The one fact every record has is still shown.
    expect(screen.getByText("Veids")).toBeInTheDocument();
  });

  it("supports heritage-object types beyond manors, and unknown types without guessing a label", async () => {
    createObjectDetailDataSourceFromEnv.mockReturnValue(
      dataSourceReturning(detailRow({ object_type: "ruin_or_historical_site" })),
    );
    await renderObjectPage("rundales-pils-parks");
    expect(screen.getAllByText("Vēsturiska vieta vai drupas").length).toBeGreaterThan(0);
  });

  it("returns a 404 for a slug with no published object", async () => {
    const source = dataSourceReturning(null);
    createObjectDetailDataSourceFromEnv.mockReturnValue(source);

    await expect(renderObjectPage("no-such-object")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("returns a 404 for a malformed slug without querying at all", async () => {
    const source = dataSourceReturning(detailRow());
    createObjectDetailDataSourceFromEnv.mockReturnValue(source);

    await expect(renderObjectPage("Not A Slug!")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(source.fetchPublishedObjectBySlug).not.toHaveBeenCalled();
  });

  it("links back to the first directory page when there is no directory context", async () => {
    createObjectDetailDataSourceFromEnv.mockReturnValue(dataSourceReturning(detailRow()));

    await renderObjectPage("rundales-pils-parks");

    expect(screen.getByRole("link", { name: /atpakaļ uz katalogu/i })).toHaveAttribute(
      "href",
      "/objects",
    );
  });

  it("links back to the directory page the visitor came from, and passes that context on", async () => {
    const token = encodeCursor({ name: "Mežotnes pils", id: PARENT_ID });
    createObjectDetailDataSourceFromEnv.mockReturnValue(dataSourceReturning(detailRow()));

    await renderObjectPage("rundales-pils-parks", { from: token });

    expect(screen.getByRole("link", { name: /atpakaļ uz katalogu/i })).toHaveAttribute(
      "href",
      `/objects?cursor=${token}`,
    );
    const relations = screen.getByTestId("relations");
    expect(relations).toHaveAttribute("data-cursor", token);
    expect(relations).toHaveAttribute("data-object-id", OBJECT_ID);
    expect(relations).toHaveAttribute("data-parent-id", PARENT_ID);
  });

  it("ignores a tampered `from` value instead of putting it in a link", async () => {
    createObjectDetailDataSourceFromEnv.mockReturnValue(dataSourceReturning(detailRow()));

    await renderObjectPage("rundales-pils-parks", { from: "https://evil.example/?x=1" });

    expect(screen.getByRole("link", { name: /atpakaļ uz katalogu/i })).toHaveAttribute(
      "href",
      "/objects",
    );
    expect(screen.getByTestId("relations")).toHaveAttribute("data-cursor", "");
  });

  it("shows a safe, generic state when the data source is not configured", async () => {
    createObjectDetailDataSourceFromEnv.mockImplementation(() => {
      throw new PublicDataConfigurationError("NEXT_PUBLIC_SUPABASE_URL must be set");
    });

    await renderObjectPage("rundales-pils-parks");

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/NEXT_PUBLIC_SUPABASE/)).not.toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("shows a safe, generic state when the query fails, without leaking the cause", async () => {
    createObjectDetailDataSourceFromEnv.mockReturnValue({
      ...dataSourceReturning(null),
      fetchPublishedObjectBySlug: vi.fn(async () => {
        throw new ObjectDetailQueryError("failed", new Error("connect ECONNREFUSED 10.0.0.5:5432"));
      }),
    });

    await renderObjectPage("rundales-pils-parks");

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/10\.0\.0\.5|ECONNREFUSED/)).not.toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe("generateMetadata", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  async function metadataFor(slug: string) {
    const { generateMetadata } = await import("./page");
    return generateMetadata({
      params: Promise.resolve({ slug }),
      searchParams: Promise.resolve({}),
    });
  }

  it("uses the record's own name and summary", async () => {
    createObjectDetailDataSourceFromEnv.mockReturnValue(dataSourceReturning(detailRow()));

    await expect(metadataFor("rundales-pils-parks")).resolves.toEqual({
      title: "Rundāles pils franču dārzs un parks",
      description: "Regulārs franču dārzs pils dienvidu pusē. Ierīkots 18. gadsimtā.",
    });
  });

  it("gives an unknown slug a not-found title", async () => {
    createObjectDetailDataSourceFromEnv.mockReturnValue(dataSourceReturning(null));

    await expect(metadataFor("no-such-object")).resolves.toEqual({ title: "Objekts nav atrasts" });
  });

  it("falls back to a neutral title when the lookup fails", async () => {
    createObjectDetailDataSourceFromEnv.mockImplementation(() => {
      throw new PublicDataConfigurationError("not configured");
    });

    await expect(metadataFor("rundales-pils-parks")).resolves.toEqual({ title: "Objekts" });
  });
});
