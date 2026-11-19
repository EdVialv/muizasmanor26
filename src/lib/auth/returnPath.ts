/**
 * Where to go after signing in (Day 21 - docs/DAY21_AUTH_PERMISSIONS_NOTES.md).
 *
 * The sign-in page carries the protected page the visitor asked for as
 * `next`. It is untrusted input, so only a same-site path inside the
 * administration area is accepted; anything else - another origin,
 * a protocol-relative "//host", a backslash trick, an encoded scheme,
 * control characters, a path outside /admin, or the sign-in page itself -
 * falls back to the administration home.
 */

export const ADMIN_HOME = "/admin";
export const SIGN_IN_PATH = "/admin/sign-in";
const MAX_RETURN_PATH_LENGTH = 512;
const BASE = "https://muizas.invalid";

export function safeReturnPath(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_RETURN_PATH_LENGTH) {
    return ADMIN_HOME;
  }
  // Only a plain absolute path: no scheme, no "//host", no backslashes
  // (browsers treat "\" like "/"), no whitespace or control characters.
  if (!raw.startsWith("/") || raw.startsWith("//") || /[\\\s\u0000-\u001f\u007f]/.test(raw)) {
    return ADMIN_HOME;
  }
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return ADMIN_HOME;
  }
  if (url.origin !== BASE) {
    return ADMIN_HOME;
  }
  const path = url.pathname;
  const insideAdmin = path === ADMIN_HOME || path.startsWith(`${ADMIN_HOME}/`);
  if (!insideAdmin || path === SIGN_IN_PATH || path.startsWith(`${SIGN_IN_PATH}/`)) {
    return ADMIN_HOME;
  }
  // Re-serialised from the parsed URL: dot segments resolved, no fragment.
  return `${path}${url.search}`;
}

/** The sign-in URL for a protected path, with optional reason ("expired"). */
export function signInHref(next: string, reason?: "expired" | "signed_out"): string {
  const params = new URLSearchParams();
  const target = safeReturnPath(next);
  if (target !== ADMIN_HOME) {
    params.set("next", target);
  }
  if (reason) {
    params.set("reason", reason);
  }
  const query = params.toString();
  return query ? `${SIGN_IN_PATH}?${query}` : SIGN_IN_PATH;
}
