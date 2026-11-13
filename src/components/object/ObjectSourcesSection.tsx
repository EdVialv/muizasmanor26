import { formatLatvianDate } from "@/lib/format/dates";
import { displayHost } from "@/lib/format/safeLinks";
import type { ObjectDetail } from "@/lib/objects/detail";

/**
 * The record's principal source and the date its public facts were last
 * checked - both exactly as stored. The date is heritage_objects
 * .last_verified_at; it is never replaced by a deployment date or by today.
 */
export default function ObjectSourcesSection({
  object,
}: {
  object: Pick<ObjectDetail, "sourceUrl" | "lastVerifiedAt">;
}) {
  const verified = formatLatvianDate(object.lastVerifiedAt);
  if (!object.sourceUrl && !verified) {
    return null;
  }

  return (
    <section className="objectSection" aria-labelledby="object-sources">
      <h2 id="object-sources">Avots un pārbaude</h2>
      <dl className="objectFacts">
        {object.sourceUrl ? (
          <div>
            <dt>Avots</dt>
            <dd>
              <a href={object.sourceUrl} rel="noopener noreferrer">
                {displayHost(object.sourceUrl)}
              </a>
            </dd>
          </div>
        ) : null}
        {verified && object.lastVerifiedAt ? (
          <div>
            <dt>Informācija pārbaudīta</dt>
            <dd>
              <time dateTime={object.lastVerifiedAt}>{verified}</time>
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
