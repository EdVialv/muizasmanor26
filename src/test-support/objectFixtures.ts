import type { ObjectDetail, RawObjectDetailRow } from "@/lib/objects/detail";

/** A complete raw heritage_objects row as the object-page query returns it. */
export function rawObjectDetailRow(
  overrides: Partial<RawObjectDetailRow> = {},
): RawObjectDetailRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
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
    ownership_verified_at: null,
    source_url: null,
    last_verified_at: null,
    public_access: null,
    public_access_notes_lv: null,
    accessibility: null,
    accessibility_notes_lv: null,
    access_verified_at: null,
    object_images: [],
    object_contacts: [],
    ...overrides,
  };
}

/** A presentation-shape object with every optional field empty. */
export function sparseObjectDetail(overrides: Partial<ObjectDetail> = {}): ObjectDetail {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    slug: "rundales-pils",
    nameLv: "Rundāles pils",
    objectType: "palace_or_castle",
    summaryLv: null,
    municipality: null,
    coordinates: null,
    conditionCategory: null,
    conditionNotesLv: null,
    ownershipType: null,
    parentObjectId: null,
    ownershipVerifiedAt: null,
    sourceUrl: null,
    lastVerifiedAt: null,
    publicAccess: null,
    publicAccessNotesLv: null,
    accessibility: null,
    accessibilityNotesLv: null,
    accessVerifiedAt: null,
    images: [],
    hasMoreImages: false,
    contacts: [],
    ...overrides,
  };
}
