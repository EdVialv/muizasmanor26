import Link from "next/link";
import type { DirectoryObjectSummary } from "@/lib/directory/queries";
import {
  conditionCategoryLabel,
  objectTypeLabel,
  ownershipTypeLabel,
} from "@/lib/directory/labels";

/**
 * A reusable card for one published heritage object, used by the Day 13
 * public directory (src/app/objects/page.tsx) and intended for reuse
 * wherever else a compact object summary is needed later (e.g. a future
 * map popup or related-objects list).
 *
 * Shows every value DirectoryObjectSummary actually has and silently omits
 * any that are null - condition_category, ownership_type and
 * publicAccessStatus are all genuinely optional per docs/DATA_MODEL.md (or,
 * for publicAccessStatus, not yet a real column at all - see
 * docs/DAY13_DIRECTORY_NOTES.md). Nothing here invents a placeholder value
 * to fill a gap.
 *
 * Images are a Day 15 task (docs/DAY13_DIRECTORY_NOTES.md scope boundary):
 * this card's media area is a restrained, explicitly decorative block
 * (aria-hidden, no implied photo), not a placeholder photo and not any part
 * of the real image pipeline.
 */
export default function HeritageObjectCard({ object }: { object: DirectoryObjectSummary }) {
  const condition = object.conditionCategory
    ? conditionCategoryLabel(object.conditionCategory)
    : null;

  return (
    <li className="objectCard">
      <div className="objectCardMedia" aria-hidden="true" />
      <div className="objectCardBody">
        <p className="objectCardType">{objectTypeLabel(object.objectType)}</p>
        <h3 className="objectCardTitle">
          <Link href={`/objects/${object.slug}`}>{object.nameLv}</Link>
        </h3>
        {object.municipality ? <p className="objectCardMeta">{object.municipality}</p> : null}
        <ul className="objectCardTags">
          {condition ? (
            <li className="objectCardTag" title={condition.note}>
              {condition.label}
            </li>
          ) : null}
          {object.ownershipType ? (
            <li className="objectCardTag">{ownershipTypeLabel(object.ownershipType)}</li>
          ) : null}
          {object.publicAccessStatus ? (
            <li className="objectCardTag">{object.publicAccessStatus}</li>
          ) : null}
        </ul>
      </div>
    </li>
  );
}
