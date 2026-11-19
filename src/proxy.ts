import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AuthConfigurationError, readAuthConfig } from "@/lib/auth/config";

/**
 * Next.js 16 proxy (formerly middleware) for the administration area only
 * (Day 21 - docs/DAY21_AUTH_PERMISSIONS_NOTES.md).
 *
 * Its one job is to keep the Supabase session cookies fresh: Server
 * Components cannot write cookies, so an expired access token is refreshed
 * here (getClaims() refreshes when needed) and the new cookies are set on
 * the request and the response.
 *
 * It does NOT authorise anything. Every protected page, route handler and
 * server action verifies the user and reads their role itself
 * (src/lib/auth/session.ts) - a proxy can be skipped by matcher mistakes or
 * by internal requests, so it must never be the only check.
 *
 * Public pages are not matched: they never read a session and stay
 * cacheable.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  let config;
  try {
    config = readAuthConfig();
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      return withPrivateHeaders(response);
    }
    throw error;
  }

  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refreshes the session when its access token has expired. The result is
  // not used for any decision here.
  try {
    await supabase.auth.getClaims();
  } catch {
    // An unreachable auth server: the page's own check will deny access.
  }

  return withPrivateHeaders(response);
}

/** Staff responses are personal: never stored by a shared cache, never indexed. */
function withPrivateHeaders(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin/:path*"],
};
