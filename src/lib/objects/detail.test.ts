import { describe, expect, it, vi } from "vitest";
import {
  fetchObjectBySlug,
  fetchObjectRelations,
  isValidObjectSlug,
  MAX_OWNER_FAMILIES,
  MAX_RELATED_CHILDREN,
  ObjectDetailQueryError,
  type ObjectDetailDataSource,
  type RawObjectDetailRow,
  type RawRelatedObjectRow,
} from "./detail";

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function detailRow(overrides: Partial<RawObjectDetailRow> = {}): RawObjectDetailRow {
  return {
    id: ID(1),
    slug: "rundales-pils",
    name_lv: "Rundāles pils",
    object_type: "palace_or_castle",
    summary_lv: "Baroka pils Zemgalē.",
    municipality: "Bauskas novads",
    latitude: 56.4142,
    longitude: 24.0164,
    condition_category: "class_a",
    condition_notes_lv: null,
    ownership_type: "state",
    parent_object_id: null,
    ...overrides,
  };
}

function related(n: number, name: string): RawRelatedObjectRow {
  return { id: ID(n), slug: `object-${n}`, name_lv: name, object_type: "outbuilding" };
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

describe("isValidObjectSlug", () => {
  it("accepts the slug shape the importer produces", () => {
    expect(isValidObjectSlug("rundales-pils")).toBe(true);
    expect(isValidObjectSlug("muiza-2")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isValidObjectSlug("")).toBe(false);
    expect(isValidObjectSlug("Rundales-Pils")).toBe(false);
    expect(isValidObjectSlug("rundāles-pils")).toBe(false);
    expect(isValidObjectSlug("-leading")).toBe(false);
    expect(isValidObjectSlug("trailing-")).toBe(false);
    expect(isValidObjectSlug("double--hyphen")).toBe(false);
    expect(isValidObjectSlug("a/b")).toBe(false);
    expect(isValidObjectSlug("a,b)")).toBe(false);
    expect(isValidObjectSlug("a".repeat(201))).toBe(false);
    expect(isValidObjectSlug(undefined)).toBe(false);
  });
});

describe("fetchObjectBySlug", () => {
  it("maps a complete row onto the presentation shape", async () => {
    const source = dataSource({ fetchPublishedObjectBySlug: vi.fn(async () => detailRow()) });

    await expect(fetchObjectBySlug(source, "rundales-pils")).resolves.toEqual({
      id: ID(1),
      slug: "rundales-pils",
      nameLv: "Rundāles pils",
      objectType: "palace_or_castle",
      summaryLv: "Baroka pils Zemgalē.",
      municipality: "Bauskas novads",
      coordinates: { latitude: 56.4142, longitude: 24.0164 },
      conditionCategory: "class_a",
      conditionNotesLv: null,
      ownershipType: "state",
      parentObjectId: null,
    });
  });

  it("returns null without querying when the slug cannot be real", async () => {
    const source = dataSource();

    await expect(fetchObjectBySlug(source, "Not A Slug!")).resolves.toBeNull();
    expect(source.fetchPublishedObjectBySlug).not.toHaveBeenCalled();
  });

  it("returns null when no published object has the slug", async () => {
    const source = dataSource();

    await expect(fetchObjectBySlug(source, "no-such-object")).resolves.toBeNull();
    expect(source.fetchPublishedObjectBySlug).toHaveBeenCalledWith("no-such-object");
  });

  it("keeps sparse records sparse: blank optional text becomes null, never filler", async () => {
    const source = dataSource({
      fetchPublishedObjectBySlug: vi.fn(async () =>
        detailRow({
          summary_lv: "   ",
          municipality: "",
          latitude: null,
          longitude: null,
          condition_category: null,
          condition_notes_lv: "  ",
          ownership_type: null,
        }),
      ),
    });

    const object = await fetchObjectBySlug(source, "rundales-pils");

    expect(object).toMatchObject({
      summaryLv: null,
      municipality: null,
      coordinates: null,
      conditionCategory: null,
      conditionNotesLv: null,
      ownershipType: null,
    });
  });

  it("accepts numeric strings for coordinates and drops out-of-range or half-missing pairs", async () => {
    const asStrings = dataSource({
      fetchPublishedObjectBySlug: vi.fn(async () =>
        detailRow({ latitude: "56.4142", longitude: "24.0164" }),
      ),
    });
    const outOfRange = dataSource({
      fetchPublishedObjectBySlug: vi.fn(async () => detailRow({ latitude: 156, longitude: 24 })),
    });
    const halfMissing = dataSource({
      fetchPublishedObjectBySlug: vi.fn(async () => detailRow({ latitude: 56.4, longitude: null })),
    });

    expect((await fetchObjectBySlug(asStrings, "rundales-pils"))?.coordinates).toEqual({
      latitude: 56.4142,
      longitude: 24.0164,
    });
    expect((await fetchObjectBySlug(outOfRange, "rundales-pils"))?.coordinates).toBeNull();
    expect((await fetchObjectBySlug(halfMissing, "rundales-pils"))?.coordinates).toBeNull();
  });

  it("wraps a data-source failure rather than letting it propagate raw", async () => {
    const source = dataSource({
      fetchPublishedObjectBySlug: vi.fn(async () => {
        throw new Error("connection refused");
      }),
    });

    await expect(fetchObjectBySlug(source, "rundales-pils")).rejects.toBeInstanceOf(
      ObjectDetailQueryError,
    );
  });
});

describe("fetchObjectRelations", () => {
  it("returns parent, children and owner families for an object that has them", async () => {
    const source = dataSource({
      fetchPublishedObjectById: vi.fn(async () => related(9, "Rundāles pils")),
      fetchPublishedChildren: vi.fn(async () => [related(2, "Parks"), related(3, "Staļļi")]),
      fetchVerifiedOwnerFamilies: vi.fn(async () => [
        { family_name: "von Biron", start_year_approx: 1735, end_year_approx: 1795 },
      ]),
    });

    const relations = await fetchObjectRelations(source, { id: ID(1), parentObjectId: ID(9) });

    expect(relations.parent).toEqual({
      id: ID(9),
      slug: "object-9",
      nameLv: "Rundāles pils",
      objectType: "outbuilding",
    });
    expect(relations.children.map((child) => child.nameLv)).toEqual(["Parks", "Staļļi"]);
    expect(relations.hasMoreChildren).toBe(false);
    expect(relations.ownerFamilies).toEqual([
      { familyName: "von Biron", startYearApprox: 1735, endYearApprox: 1795 },
    ]);
  });

  it("does not look up a parent when the object has none", async () => {
    const source = dataSource();

    const relations = await fetchObjectRelations(source, { id: ID(1), parentObjectId: null });

    expect(source.fetchPublishedObjectById).not.toHaveBeenCalled();
    expect(relations).toEqual({
      parent: null,
      children: [],
      hasMoreChildren: false,
      ownerFamilies: [],
    });
  });

  it("reports an unpublished parent as no parent, without revealing it exists", async () => {
    // The data source returns null for a parent id RLS hides.
    const source = dataSource({ fetchPublishedObjectById: vi.fn(async () => null) });

    const relations = await fetchObjectRelations(source, { id: ID(1), parentObjectId: ID(9) });

    expect(source.fetchPublishedObjectById).toHaveBeenCalledWith(ID(9));
    expect(relations.parent).toBeNull();
  });

  it("issues a fixed, bounded set of requests - never one per child", async () => {
    const source = dataSource({
      fetchPublishedChildren: vi.fn(async () => [
        related(2, "A"),
        related(3, "B"),
        related(4, "C"),
      ]),
    });

    await fetchObjectRelations(source, { id: ID(1), parentObjectId: ID(9) });

    expect(source.fetchPublishedObjectById).toHaveBeenCalledTimes(1);
    expect(source.fetchPublishedChildren).toHaveBeenCalledTimes(1);
    expect(source.fetchPublishedChildren).toHaveBeenCalledWith(ID(1), MAX_RELATED_CHILDREN + 1);
    expect(source.fetchVerifiedOwnerFamilies).toHaveBeenCalledTimes(1);
    expect(source.fetchVerifiedOwnerFamilies).toHaveBeenCalledWith(ID(1), MAX_OWNER_FAMILIES);
  });

  it("caps the children list and says so when there are more", async () => {
    const many = Array.from({ length: MAX_RELATED_CHILDREN + 1 }, (_, i) =>
      related(i + 10, `Objekts ${i}`),
    );
    const source = dataSource({ fetchPublishedChildren: vi.fn(async () => many) });

    const relations = await fetchObjectRelations(source, { id: ID(1), parentObjectId: null });

    expect(relations.children).toHaveLength(MAX_RELATED_CHILDREN);
    expect(relations.hasMoreChildren).toBe(true);
  });

  it("drops an owner-family row whose name is blank", async () => {
    const source = dataSource({
      fetchVerifiedOwnerFamilies: vi.fn(async () => [
        { family_name: "  ", start_year_approx: null, end_year_approx: null },
        { family_name: " Zubov ", start_year_approx: null, end_year_approx: null },
      ]),
    });

    const relations = await fetchObjectRelations(source, { id: ID(1), parentObjectId: null });

    expect(relations.ownerFamilies).toEqual([
      { familyName: "Zubov", startYearApprox: null, endYearApprox: null },
    ]);
  });

  it("wraps a failure in any of the requests", async () => {
    const source = dataSource({
      fetchPublishedChildren: vi.fn(async () => {
        throw new Error("timeout");
      }),
    });

    await expect(
      fetchObjectRelations(source, { id: ID(1), parentObjectId: null }),
    ).rejects.toBeInstanceOf(ObjectDetailQueryError);
  });
});
