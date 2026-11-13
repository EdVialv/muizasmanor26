/**
 * Turns stored contact and source values into link targets, or refuses to
 * (docs/DAY15_VISUAL_ALPHA_NOTES.md). Values come from the database, but
 * they are still data: a `javascript:` or `data:` URL must never become an
 * href, so anything that is not plainly http(s), an e-mail address or a
 * phone number is shown as text instead of linked.
 */

/** Returns the normalised URL when it is http(s), otherwise null. */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }
  return parsed.toString();
}

/** The host to show as link text, without a leading "www.". */
export function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Deliberately narrow: no "?", "&" or "%", so a stored value can never add
 * mailto parameters (subject, cc, body) to the link.
 */
const EMAIL_PATTERN = /^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function mailtoHref(value: string): string | null {
  const trimmed = value.trim();
  return EMAIL_PATTERN.test(trimmed) ? `mailto:${trimmed}` : null;
}

/** Accepts digits with common separators and an optional leading "+". */
export function telHref(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\+?[\d\s().-]{5,25}$/.test(trimmed)) {
    return null;
  }
  const digits = trimmed.replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 5 ? `tel:${digits}` : null;
}
