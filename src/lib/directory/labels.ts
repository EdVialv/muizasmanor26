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

/**
 * Day 15 labels. Like the object-type and ownership labels above, this
 * wording is this session's own and needs a product copy review
 * (docs/DAY15_VISUAL_ALPHA_NOTES.md).
 */
const PUBLIC_ACCESS_LABELS: Record<string, string> = {
  open: "Atvērts apmeklētājiem",
  by_appointment: "Apmeklējums pēc pieraksta",
  exterior_only: "Apskatāms tikai no ārpuses",
  not_accessible: "Nav pieejams apmeklētājiem",
};

const ACCESSIBILITY_LABELS: Record<string, string> = {
  accessible: "Pieejams cilvēkiem ar kustību traucējumiem",
  partially_accessible: "Daļēji pieejams cilvēkiem ar kustību traucējumiem",
  not_accessible: "Nav pieejams cilvēkiem ar kustību traucējumiem",
};

const CONTACT_TYPE_LABELS: Record<string, string> = {
  email: "E-pasts",
  phone: "Tālrunis",
  website: "Mājaslapa",
  address: "Adrese",
  social: "Sociālie tīkli",
  booking: "Rezervācija",
};

export function publicAccessLabel(value: string): string {
  return PUBLIC_ACCESS_LABELS[value] ?? value;
}

export function accessibilityLabel(value: string): string {
  return ACCESSIBILITY_LABELS[value] ?? value;
}

export function contactTypeLabel(value: string): string {
  return CONTACT_TYPE_LABELS[value] ?? value;
}

/**
 * Day 17 filter labels for the three recorded services
 * (docs/DAY17_DIRECTORY_FILTERS_NOTES.md). This session's own wording, for
 * product copy review like the labels above. "Pasākumi" means event
 * services or a venue, not a calendar of dated events.
 */
const SERVICE_LABELS: Record<string, string> = {
  accommodation: "Naktsmītnes",
  catering: "Ēdināšana",
  events: "Pasākumu rīkošana",
};

export function serviceLabel(value: string): string {
  return SERVICE_LABELS[value] ?? value;
}

/**
 * Day 18 filter labels (docs/DAY18_CLASSIFICATION_FILTERS_NOTES.md). The
 * ownership groups are docs/DATA_MODEL.md's "Ownership filter groups";
 * "unknown" always says "not recorded" - never "private", "ruined" or "no
 * family". This session's own wording, for product copy review.
 */
const OWNERSHIP_GROUP_LABELS: Record<string, string> = {
  private: "Privāts (privātpersona vai privāts juridiskais subjekts)",
  public: "Publisks (pašvaldība vai valsts)",
  unknown: "Nezināms / nav reģistrēts",
};

/** Short forms for the active-filter chips, where the group is not visible. */
const OWNERSHIP_GROUP_CHIP_LABELS: Record<string, string> = {
  private: "Privāts īpašnieks",
  public: "Publisks īpašnieks",
  unknown: "Īpašnieks nav reģistrēts",
};

export const UNKNOWN_OPTION_LABEL = "Nezināms / nav reģistrēts";
export const FAMILY_UNKNOWN_OPTION_LABEL = "Nezināma / nav reģistrēta";

export function ownershipGroupLabel(value: string): string {
  return OWNERSHIP_GROUP_LABELS[value] ?? value;
}

export function ownershipGroupChipLabel(value: string): string {
  return OWNERSHIP_GROUP_CHIP_LABELS[value] ?? value;
}

/** Condition filter option label: the documented label, or "not recorded" for unknown. */
export function conditionFilterLabel(value: string): string {
  return value === "unknown" ? UNKNOWN_OPTION_LABEL : conditionCategoryLabel(value).label;
}

export function conditionChipLabel(value: string): string {
  return value === "unknown" ? "Stāvoklis nav reģistrēts" : conditionCategoryLabel(value).label;
}

export function familyChipLabel(name: string): string {
  return `Dzimta: ${name}`;
}

export const FAMILY_UNKNOWN_CHIP_LABEL = "Dzimta nav reģistrēta";
