import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeCursor } from "@/lib/directory/cursor";
import {
  ObjectDetailQueryError,
  type ObjectDetailDataSource,
  type RawObjectDetailRow,
} from "@/lib/objects/detail";
import { PublicDataConfigurationError } from "@/lib/supabase/publicClient";
import { rawObjectDetailRow } from "@/test-support/objectFixtures";

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
  return rawObjectDetailRow({
    id: OBJECT_ID,
    slug: "rundales-pils-parks",
    name_lv: "Rundāles pils franču dārzs un parks",
    object_type: "park_or_garden",
    summary_lv: "Regulārs franču dārzs pils dienvidu pusē.\n\nIerīkots 18. gadsimtā.",
    municipality: "Bauskas novads (Rundāles pagasts)",
    condition_category: "class_b",
    condition_notes_lv: "Parteris atjaunots.",
    parent_object_id: PARENT_ID,
    ...overrides,
  });
}

function dataSourceReturning(row: RawObjectDetailRow | null): ObjectDetailDataSource {
  return {
    fetchPublishedObjectBySlug: vi.fn(async () => row),
    fetchPublishedObjectById: vi.fn(async () => null),
    fetchPublishedChildren: vi.fn(async () => []),
    fetchVerifiedOwnerFamilies: vi.fn(async () => []),
  };
}

async function renderObjectPage(
  slug: string,
  searchParams: { from?: string | string[]; fromQ?: string | string[] } = {},
) {
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
    expect(screen.queryByText(/nav norādīts|—/i)).not.toBeInTheDocument();
    // The one fact every record has is still shown.
    expect(screen.getByText("Veids")).toBeInTheDocument();
    // Day 15: no image, no gallery, no contacts and no source section - and
    // access is reported as not yet collected, never as "not accessible".
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    for (const heading of ["Attēli", "Kontakti", "Avots un pārbaude"]) {
      expect(screen.queryByRole("heading", { name: heading })).not.toBeInTheDocument();
    }
    expect(screen.getByText(/vēl nav apkopota/i)).toBeInTheDocument();
    expect(screen.queryByText(/nav pieejams/i)).not.toBeInTheDocument();
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

  it("links back to the search the visitor came from (Day 16)", async () => {
    const { searchScope } = await import("@/lib/directory/searchQuery");
    const token = encodeCursor({
      name: "Mežotnes pils",
      id: PARENT_ID,
      scope: searchScope("pils"),
    });
    createObjectDetailDataSourceFromEnv.mockReturnValue(dataSourceReturning(detailRow()));

    await renderObjectPage("rundales-pils-parks", { from: token, fromQ: "pils" });

    expect(screen.getByRole("link", { name: /atpakaļ uz katalogu/i })).toHaveAttribute(
      "href",
      `/objects?q=pils&cursor=${token}`,
    );
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

describe("ObjectPage - images, sources, contacts and access (Day 15)", () => {
  beforeEach(() => {
    notFound.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  const IMAGE = {
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    source_image_url: "https://blogger.googleusercontent.com/img/b/x/y/s3000/a.jpg",
    alt_text_lv: null,
    caption_lv: null,
    credit: null,
    license_name: null,
    license_url: null,
    source_attribution_note: "Foto: manasvietas.blogspot.com",
    is_primary: true,
    sort_order: 0,
  };

  it("shows the cover image first, the rest as a gallery, with their attribution", async () => {
    createObjectDetailDataSourceFromEnv.mockReturnValue(
      dataSourceReturning(
        detailRow({
          object_images: [
            IMAGE,
            {
              ...IMAGE,
              id: "aaaaaaaa-0000-4000-8000-000000000002",
              is_primary: false,
              sort_order: 1,
            },
            {
              ...IMAGE,
              id: "aaaaaaaa-0000-4000-8000-000000000003",
              is_primary: false,
              sort_order: 2,
            },
          ],
        }),
      ),
    );

    await renderObjectPage("rundales-pils-parks");

    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(3);
    expect(images[0]).toHaveAttribute("loading", "eager");
    expect(images[1]).toHaveAttribute("loading", "lazy");
    expect(screen.getByRole("heading", { name: "Attēli" })).toBeInTheDocument();
    expect(screen.getAllByText(/Foto: manasvietas\.blogspot\.com/).length).toBeGreaterThan(0);
  });

  it("shows the recorded source, verification dates, access and public contacts", async () => {
    createObjectDetailDataSourceFromEnv.mockReturnValue(
      dataSourceReturning(
        detailRow({
          source_url: "https://rundale.net/lv/",
          last_verified_at: "2026-10-08T00:00:00+00:00",
          ownership_verified_at: "2026-09-01",
          public_access: "open",
          accessibility: "not_accessible",
          object_contacts: [
            {
              contact_type: "email",
              label: "Informācija",
              contact_value: "info@example.org",
              is_primary: true,
              verified_at: null,
            },
          ],
        }),
      ),
    );

    await renderObjectPage("rundales-pils-parks");

    expect(screen.getByRole("link", { name: "rundale.net" })).toHaveAttribute(
      "href",
      "https://rundale.net/lv/",
    );
    expect(screen.getByText("2026. gada 8. oktobris")).toBeInTheDocument();
    expect(screen.getByText("2026. gada 1. septembris")).toBeInTheDocument();
    expect(screen.getByText("Atvērts apmeklētājiem")).toBeInTheDocument();
    expect(screen.getByText("Nav pieejams cilvēkiem ar kustību traucējumiem")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "info@example.org" })).toHaveAttribute(
      "href",
      "mailto:info@example.org",
    );
  });

  it("keeps a single h1 and an unbroken heading order", async () => {
    createObjectDetailDataSourceFromEnv.mockReturnValue(
      dataSourceReturning(detailRow({ source_url: "https://rundale.net/lv/" })),
    );

    await renderObjectPage("rundales-pils-parks");

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const levels = screen
      .getAllByRole("heading")
      .map((heading) => Number(heading.tagName.slice(1)));
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    }
  });
});
