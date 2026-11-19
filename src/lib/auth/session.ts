/**
 * Who is asking, and with which staff role (Day 21 -
 * docs/DAY21_AUTH_PERMISSIONS_NOTES.md). Used by every protected page,
 * route handler and server action - not by a layout or the proxy alone.
 *
 * 1. The identity is verified on the server: getClaims() checks the access
 *    token's signature (asymmetric keys) or asks Supabase Auth (symmetric
 *    keys); a session that merely decodes is never trusted.
 * 2. The role is read from public.staff_members with the user's own token,
 *    so Row Level Security returns the user's own row or nothing. Nothing
 *    in user_metadata, app_metadata, the URL or the client is consulted.
 * 3. Default deny: a missing, unknown or unreadable role is no staff
 *    access; a failure to verify is reported as "unverified", never as
 *    access.
 *
 * Kept free of Next.js imports so it is unit-tested with a fake client.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseStaffRole, type StaffRole } from "./roles";

export type StaffSession =
  /** No valid session. `expired`: a session cookie was sent but is no longer valid. */
  | { kind: "anonymous"; expired: boolean }
  /** Signed in, but not staff (no row, or an unknown role). */
  | { kind: "not_staff"; userId: string; email: string | null }
  /** Signed in as staff. */
  | { kind: "staff"; userId: string; email: string | null; role: StaffRole }
  /** The role could not be verified (database or network error): deny. */
  | { kind: "unverified" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getStaffSession(
  client: SupabaseClient,
  { hadSessionCookie }: { hadSessionCookie: boolean },
): Promise<StaffSession> {
  let claims: Record<string, unknown> | null = null;
  try {
    const { data, error } = await client.auth.getClaims();
    claims = !error && data?.claims ? (data.claims as Record<string, unknown>) : null;
  } catch {
    claims = null;
  }
  const userId = typeof claims?.sub === "string" && UUID.test(claims.sub) ? claims.sub : null;
  if (!claims || !userId || claims.role !== "authenticated") {
    return { kind: "anonymous", expired: hadSessionCookie };
  }
  const email = typeof claims.email === "string" ? claims.email : null;

  try {
    const { data, error } = await client
      .from("staff_members")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      return { kind: "unverified" };
    }
    const role = parseStaffRole((data as { role?: unknown } | null)?.role);
    return role ? { kind: "staff", userId, email, role } : { kind: "not_staff", userId, email };
  } catch {
    return { kind: "unverified" };
  }
}
