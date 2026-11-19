import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { isSupabaseAuthCookie, readAuthConfig } from "./config";
import { authCookieOptions } from "./cookies";

/**
 * The Supabase client for staff pages, route handlers and server actions
 * (Day 21). It reads and writes the session cookies through Next's cookie
 * store - @supabase/ssr manages them, with the shared attributes from
 * ./cookies.ts (Secure in production, SameSite=Lax; httpOnly is not
 * available for the Supabase session cookie, but the app never stores
 * tokens itself, never in localStorage, and never puts them in URLs).
 *
 * Server Components cannot set cookies; the refreshed session is written by
 * src/proxy.ts (and by server actions / route handlers), so a failed write
 * from a Server Component is expected and ignored.
 */
export async function createAuthServerClient(): Promise<{
  client: SupabaseClient;
  hadSessionCookie: boolean;
}> {
  const { url, publishableKey } = readAuthConfig();
  const cookieStore = await cookies();
  const hadSessionCookie = cookieStore.getAll().some(({ name }) => isSupabaseAuthCookie(name));
  const client = createServerClient(url, publishableKey, {
    cookieOptions: authCookieOptions(),
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component: the proxy refreshes cookies instead.
        }
      },
    },
  });
  return { client, hadSessionCookie };
}
