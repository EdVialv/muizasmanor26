import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { DirectoryObjectSummary } from "@/lib/directory/queries";
import HeritageObjectCard from "./HeritageObjectCard";

function wrapInList(children: ReactNode) {
  // HeritageObjectCard renders a single <li>; render()'s own container
  // isn't a list, so wrap it the way the real /objects page does.
  return <ul>{children}</ul>;
}

const COMPLETE_OBJECT: DirectoryObjectSummary = {
  id: "11111111-2222-4333-8444-555555555555",
  slug: "rundales-pils",
  nameLv: "Rundāles pils",
  objectType: "palace_or_castle",
  municipality: "Rundāles novads",
  conditionCategory: "class_a",
  ownershipType: "state",
  publicAccessStatus: null,
};

describe("HeritageObjectCard", () => {
  it("renders the name, a slug-based link, the type, municipality and condition/ownership tags", () => {
    render(wrapInList(<HeritageObjectCard object={COMPLETE_OBJECT} />));

    const link = screen.getByRole("link", { name: "Rundāles pils" });
    expect(link).toHaveAttribute("href", "/objects/rundales-pils");

    expect(screen.getByText("Pils")).toBeInTheDocument();
    expect(screen.getByText("Rundāles novads")).toBeInTheDocument();
    expect(screen.getByText("A klase")).toBeInTheDocument();
    expect(screen.getByText("Valsts")).toBeInTheDocument();
  });

  it("links using the object's own slug, not a derived or guessed one", () => {
    const object: DirectoryObjectSummary = { ...COMPLETE_OBJECT, slug: "a-totally-different-slug" };
    render(wrapInList(<HeritageObjectCard object={object} />));

    expect(screen.getByRole("link", { name: "Rundāles pils" })).toHaveAttribute(
      "href",
      "/objects/a-totally-different-slug",
    );
  });

  it("omits condition, ownership and public-access tags entirely when they are null, without inventing placeholder text", () => {
    const object: DirectoryObjectSummary = {
      ...COMPLETE_OBJECT,
      conditionCategory: null,
      ownershipType: null,
      publicAccessStatus: null,
    };
    render(wrapInList(<HeritageObjectCard object={object} />));

    expect(screen.queryByText("A klase")).not.toBeInTheDocument();
    expect(screen.queryByText("Valsts")).not.toBeInTheDocument();
    // No generic "unknown"/"not available" filler text should appear either.
    expect(screen.queryByText(/nav zināms/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/—/)).not.toBeInTheDocument();
  });

  it("omits the municipality line when it is null", () => {
    const object: DirectoryObjectSummary = { ...COMPLETE_OBJECT, municipality: null };
    render(wrapInList(<HeritageObjectCard object={object} />));

    expect(screen.queryByText("Rundāles novads")).not.toBeInTheDocument();
  });

  it("still renders the required name, slug link and object type when every optional field is null", () => {
    const object: DirectoryObjectSummary = {
      id: COMPLETE_OBJECT.id,
      slug: COMPLETE_OBJECT.slug,
      nameLv: COMPLETE_OBJECT.nameLv,
      objectType: COMPLETE_OBJECT.objectType,
      municipality: null,
      conditionCategory: null,
      ownershipType: null,
      publicAccessStatus: null,
    };
    render(wrapInList(<HeritageObjectCard object={object} />));

    expect(screen.getByRole("link", { name: "Rundāles pils" })).toHaveAttribute(
      "href",
      "/objects/rundales-pils",
    );
    expect(screen.getByText("Pils")).toBeInTheDocument();
  });

  it("falls back to the raw stored value for an object_type not in the known label map, rather than guessing a label", () => {
    const object: DirectoryObjectSummary = { ...COMPLETE_OBJECT, objectType: "future_new_type" };
    render(wrapInList(<HeritageObjectCard object={object} />));

    expect(screen.getByText("future_new_type")).toBeInTheDocument();
  });

  it("carries the directory context on its link when one is given", () => {
    render(
      wrapInList(
        <HeritageObjectCard
          object={COMPLETE_OBJECT}
          directoryContext={{ cursor: "abc_123-token" }}
        />,
      ),
    );

    expect(screen.getByRole("link", { name: "Rundāles pils" })).toHaveAttribute(
      "href",
      "/objects/rundales-pils?from=abc_123-token",
    );
  });
});
