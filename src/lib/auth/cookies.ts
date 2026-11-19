/**
 * The one cookie configuration for Supabase staff sessions (Day 21 -
 * docs/DAY21_AUTH_PERMISSIONS_NOTES.md, "Sessions"). Used by both
 * src/lib/auth/serverClient.ts and src/proxy.ts, so the two clients that
 * write session cookies cannot drift apart.
 *
 * @supabase/ssr merges these over its defaults (path "/", SameSite=Lax,
 * httpOnly false, a 400-day max-age). It does not set Secure by itself, so
 * production cookies are marked Secure here; local development over plain
 * HTTP keeps working because browsers drop Secure cookies on http:// pages.
 *
 * httpOnly stays false on purpose: the Supabase SSR session design needs
 * the session cookie to be readable by its browser client. The application
 * never reads or stores the token itself.
 */

import type { CookieOptionsWithName } from "@supabase/ssr";

export function authCookieOptions(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): CookieOptionsWithName {
  return {
    path: "/",
    sameSite: "lax",
    secure: nodeEnv === "production",
  };
}
