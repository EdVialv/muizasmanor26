import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomeFeatured from "./HomeFeatured";
import { fetchDirectoryPage } from "@/lib/directory/queries";
import { createDirectoryDataSourceFromEnv } from "@/lib/directory/supabaseDataSource";

vi.mock("@/lib/directory/queries", () => ({ fetchDirectoryPage: vi.fn() }));
vi.mock("@/lib/directory/supabaseDataSource", () => ({
  createDirectoryDataSourceFromEnv: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(createDirectoryDataSourceFromEnv).mockReturnValue({} as never);
});
describe("HomeFeatured", () => {
  it("links the published record returned by the existing directory query", async () => {
    vi.mocked(fetchDirectoryPage).mockResolvedValue({
      items: [
        {
          id: "1",
          slug: "actual-slug",
          nameLv: "Publicētā muiža",
          objectType: "manor_estate",
          municipality: null,
          conditionCategory: null,
          ownershipType: null,
          publicAccessStatus: null,
          coverImage: null,
        },
      ],
      hasNextPage: false,
      nextCursor: null,
    });
    render(await HomeFeatured());
    expect(fetchDirectoryPage).toHaveBeenCalledWith({}, null, 3);
    expect(screen.getByRole("link", { name: "Publicētā muiža" })).toHaveAttribute(
      "href",
      "/objects/actual-slug",
    );
  });
  it("provides a catalogue link without fabricating properties when data is unavailable", async () => {
    vi.mocked(fetchDirectoryPage).mockRejectedValue(new Error("unavailable"));
    render(await HomeFeatured());
    expect(screen.getByRole("link", { name: "Atvērt katalogu" })).toHaveAttribute(
      "href",
      "/objects",
    );
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
