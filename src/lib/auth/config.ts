/**
 * Supabase settings for authentication (Day 21). The same two public
 * variables as the public pages: the project URL and the publishable key.
 * Staff sessions never use a secret or service-role key - every staff read
 * runs under the signed-in user's own Row Level Security permissions.
 */

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

export interface AuthConfig {
  url: string;
  publishableKey: string;
}

export function readAuthConfig(env: Record<string, string | undefined> = process.env): AuthConfig {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new AuthConfigurationError(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must both be set for staff sign-in.",
    );
  }
  return { url, publishableKey };
}

/**
 * Supabase stores the session in cookies named sb-<project>-auth-token
 * (possibly split into .0, .1, ...). Used only to tell "your session has
 * expired" apart from "you have not signed in" - never to trust a session.
 */
export function isSupabaseAuthCookie(name: string): boolean {
  return /^sb-[^.]+-auth-token(\.\d+)?$/.test(name);
}
