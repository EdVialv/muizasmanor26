import Link from "next/link";
import type { DirectoryObjectSummary } from "@/lib/directory/queries";
import ObjectImage from "./ObjectImage";
import {
  conditionCategoryLabel,
  objectTypeLabel,
  ownershipTypeLabel,
  publicAccessLabel,
} from "@/lib/directory/labels";
import { buildObjectHref, type DirectoryContext } from "@/lib/directory/links";

/**
 * Three or four cards per row on desktop, two on a tablet, one on a phone
 * (the .objectsGrid breakpoints) - so the browser never downloads a cover
 * wider than the card it sits in.
 */
const CARD_IMAGE_SIZES = "(max-width: 40rem) 100vw, (max-width: 64rem) 50vw, 25vw";

/**
 * A reusable card for one published heritage object, used by the public
 * directory (src/app/objects/(directory)/page.tsx).
 *
 * Shows every value DirectoryObjectSummary actually has and silently omits
 * any that are null: condition, ownership and public access are optional
 * per docs/DATA_MODEL.md, and nothing here invents a placeholder for them.
 *
 * Day 15: the media area shows the object's cover image when it has one.
 * Its box has a fixed aspect ratio either way, so cards with and without a
 * photograph line up and nothing shifts when an image loads or fails. The
 * cover's alt text is the recorded one, or empty - the card's own heading
 * already names the object, so repeating the name would only be read twice.
 */
export default function HeritageObjectCard({
  object,
  directoryContext,
}: {
  object: DirectoryObjectSummary;
  /**
   * Where in the directory this card is being shown, so the object page can
   * link back to the same page of results (src/lib/directory/links.ts).
   */
  directoryContext?: DirectoryContext;
}) {
  const condition = object.conditionCategory
    ? conditionCategoryLabel(object.conditionCategory)
    : null;

  return (
    <li className="objectCard">
      {object.coverImage ? (
        <div className="objectCardMedia objectImageFrame">
          <ObjectImage
            src={object.coverImage.sourceUrl}
            alt={object.coverImage.altTextLv ?? ""}
            sizes={CARD_IMAGE_SIZES}
          />
        </div>
      ) : (
        <div className="objectCardMedia objectImageFrame" aria-hidden="true" />
      )}
      <div className="objectCardBody">
        <p className="objectCardType">{objectTypeLabel(object.objectType)}</p>
        <h3 className="objectCardTitle">
          <Link href={buildObjectHref(object.slug, directoryContext)}>{object.nameLv}</Link>
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
            <li className="objectCardTag">{publicAccessLabel(object.publicAccessStatus)}</li>
          ) : null}
        </ul>
      </div>
    </li>
  );
}
