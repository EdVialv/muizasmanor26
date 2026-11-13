import { formatLatvianDate } from "@/lib/format/dates";
import { displayHost, mailtoHref, safeHttpUrl, telHref } from "@/lib/format/safeLinks";
import { contactTypeLabel } from "@/lib/directory/labels";
import type { ObjectContact } from "@/lib/objects/detail";

/**
 * Renders a stored contact value as a link only when it is plainly an
 * e-mail address, a phone number or an http(s) URL of the matching type.
 * Anything else is printed as text - a stored value never chooses its own
 * URL scheme.
 */
function ContactValue({ contact }: { contact: ObjectContact }) {
  if (contact.type === "email") {
    const href = mailtoHref(contact.value);
    return href ? <a href={href}>{contact.value}</a> : <>{contact.value}</>;
  }
  if (contact.type === "phone") {
    const href = telHref(contact.value);
    return href ? <a href={href}>{contact.value}</a> : <>{contact.value}</>;
  }
  if (contact.type === "website" || contact.type === "booking" || contact.type === "social") {
    const href = safeHttpUrl(contact.value);
    return href ? (
      <a href={href} rel="noopener noreferrer">
        {displayHost(href)}
      </a>
    ) : (
      <>{contact.value}</>
    );
  }
  return <>{contact.value}</>;
}

/**
 * Public contacts only. The query returns nothing else: Row Level Security
 * hides every contact whose visibility is not 'public'.
 */
export default function ObjectContactsSection({ contacts }: { contacts: ObjectContact[] }) {
  if (contacts.length === 0) {
    return null;
  }

  return (
    <section className="objectSection" aria-labelledby="object-contacts">
      <h2 id="object-contacts">Kontakti</h2>
      <dl className="objectFacts">
        {contacts.map((contact, index) => {
          const verified = formatLatvianDate(contact.verifiedAt);
          return (
            <div key={`${contact.type}-${contact.value}-${index}`}>
              <dt>
                {contact.label || contactTypeLabel(contact.type)}
                {contact.label ? (
                  <span className="objectContactType">{contactTypeLabel(contact.type)}</span>
                ) : null}
              </dt>
              <dd>
                <ContactValue contact={contact} />
                {verified && contact.verifiedAt ? (
                  <p className="objectFactNote">
                    Pārbaudīts: <time dateTime={contact.verifiedAt}>{verified}</time>
                  </p>
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
