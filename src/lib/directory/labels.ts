/**
 * Latvian display labels for the enum values stored on heritage_objects
 * (docs/DATA_MODEL.md). Kept separate from the data-access and card modules
 * so the same labels can be reused by the Day 14 detail page.
 *
 * condition_category's four labels and meanings come directly from
 * docs/DATA_MODEL.md's "Manor condition labels" table. object_type and
 * ownership_type have no documented public-facing Latvian copy yet - the
 * strings below are this session's own wording, chosen for read: flag them
 * for Codex/owner review rather than treating them as final (see
 * docs/DAY13_DIRECTORY_NOTES.md "Decisions requiring Codex review").
 */

const OBJECT_TYPE_LABELS: Record<string, string> = {
  manor_estate: "Muižas komplekss",
  manor_house: "Muižas kungu māja",
  palace_or_castle: "Pils",
  park_or_garden: "Parks vai dārzs",
  ruin_or_historical_site: "Vēsturiska vieta vai drupas",
  outbuilding: "Palīgēka",
  other_heritage_object: "Cits kultūrvēsturisks objekts",
};

/**
 * Stored value -> [public label, meaning]. The meaning text is used as a
 * title/tooltip for class_a/class_b specifically, since docs/DATA_MODEL.md
 * requires public pages to explain that those two labels are an internal
 * platform classification, not an official Latvian designation.
 */
const CONDITION_CATEGORY_LABELS: Record<string, { label: string; note?: string }> = {
  historical_site: { label: "Vēsturiska vieta" },
  damaged: { label: "Bojāta ēka" },
  class_b: {
    label: "B klase",
    note: "Iekšēja platformas klasifikācija, nevis oficiāls Latvijas apzīmējums.",
  },
  class_a: {
    label: "A klase",
    note: "Iekšēja platformas klasifikācija, nevis oficiāls Latvijas apzīmējums.",
  },
};

const OWNERSHIP_TYPE_LABELS: Record<string, string> = {
  private_person: "Privātpersona",
  private_legal_entity: "Privāts juridiskais subjekts",
  municipality: "Pašvaldība",
  state: "Valsts",
};

/** Returns the stored value itself when it is not in the known label map, never a guessed label. */
export function objectTypeLabel(value: string): string {
  return OBJECT_TYPE_LABELS[value] ?? value;
}

export function conditionCategoryLabel(value: string): { label: string; note?: string } {
  return CONDITION_CATEGORY_LABELS[value] ?? { label: value };
}

export function ownershipTypeLabel(value: string): string {
  return OWNERSHIP_TYPE_LABELS[value] ?? value;
}
