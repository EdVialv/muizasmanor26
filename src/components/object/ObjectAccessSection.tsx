import { formatLatvianDate } from "@/lib/format/dates";
import { accessibilityLabel, publicAccessLabel } from "@/lib/directory/labels";
import type { ObjectDetail } from "@/lib/objects/detail";

type AccessFields = Pick<
  ObjectDetail,
  | "publicAccess"
  | "publicAccessNotesLv"
  | "accessibility"
  | "accessibilityNotesLv"
  | "accessVerifiedAt"
>;

/** Printed for a value that is not recorded - never for "not accessible". */
const UNKNOWN = "Nav zināms";

/**
 * Visitor access and accessibility.
 *
 * Unlike the page's other optional facts, this section is always present,
 * because here an absent answer can mislead: a visitor must be able to tell
 * "we have not recorded this" from "you cannot go in". So an unrecorded
 * value is printed as "Nav zināms", and "not accessible" only ever comes
 * from an explicit stored value (docs/DATA_MODEL.md: "Keep unknown values
 * null instead of writing 'no'").
 */
export default function ObjectAccessSection({ object }: { object: AccessFields }) {
  const nothingRecorded =
    object.publicAccess === null &&
    object.accessibility === null &&
    object.publicAccessNotesLv === null &&
    object.accessibilityNotesLv === null;
  const verified = formatLatvianDate(object.accessVerifiedAt);

  return (
    <section className="objectSection" aria-labelledby="object-access">
      <h2 id="object-access">Apmeklējums un piekļūstamība</h2>
      {nothingRecorded ? (
        <p className="objectSectionNote">
          Informācija par apmeklējuma iespējām un piekļūstamību vēl nav apkopota.
        </p>
      ) : (
        <dl className="objectFacts">
          <div>
            <dt>Apmeklējums</dt>
            <dd>
              {object.publicAccess ? (
                publicAccessLabel(object.publicAccess)
              ) : (
                <span className="objectUnknown">{UNKNOWN}</span>
              )}
              {object.publicAccessNotesLv ? (
                <p className="objectFactNote">{object.publicAccessNotesLv}</p>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>Piekļūstamība</dt>
            <dd>
              {object.accessibility ? (
                accessibilityLabel(object.accessibility)
              ) : (
                <span className="objectUnknown">{UNKNOWN}</span>
              )}
              {object.accessibilityNotesLv ? (
                <p className="objectFactNote">{object.accessibilityNotesLv}</p>
              ) : null}
            </dd>
          </div>
          {verified && object.accessVerifiedAt ? (
            <div>
              <dt>Informācija pārbaudīta</dt>
              <dd>
                <time dateTime={object.accessVerifiedAt}>{verified}</time>
              </dd>
            </div>
          ) : null}
        </dl>
      )}
    </section>
  );
}
