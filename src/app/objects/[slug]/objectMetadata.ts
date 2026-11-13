import type { Metadata } from "next";
import { objectTypeLabel } from "@/lib/directory/labels";
import type { ObjectDetail } from "@/lib/objects/detail";

const DESCRIPTION_MAX_LENGTH = 160;

/** Cuts on a word boundary so the description never ends mid-word. */
export function truncateForDescription(text: string): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (singleLine.length <= DESCRIPTION_MAX_LENGTH) {
    return singleLine;
  }
  const cut = singleLine.slice(0, DESCRIPTION_MAX_LENGTH - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Title and description come only from the record itself: its name, and
 * its own summary - or, when it has no summary, its type and municipality.
 * Nothing is written here that the record does not say.
 */
export function buildObjectMetadata(object: ObjectDetail): Metadata {
  const fallback = [objectTypeLabel(object.objectType), object.municipality]
    .filter(Boolean)
    .join(", ");
  return {
    title: object.nameLv,
    description: object.summaryLv ? truncateForDescription(object.summaryLv) : fallback,
  };
}
