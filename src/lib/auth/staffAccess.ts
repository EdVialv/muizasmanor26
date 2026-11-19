import "server-only";
import { AuthConfigurationError } from "./config";
import { createAuthServerClient } from "./serverClient";
import { getStaffSession, type StaffSession } from "./session";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The staff session for the current request, plus the client to read
 * staff data with (under the user's own permissions). A missing
 * configuration is reported as "unverified" - access is denied, not
 * assumed.
 */
export async function loadStaffAccess(): Promise<{
  session: StaffSession;
  client: SupabaseClient | null;
}> {
  try {
    const { client, hadSessionCookie } = await createAuthServerClient();
    return { session: await getStaffSession(client, { hadSessionCookie }), client };
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      console.error("[admin] auth is not configured:", error.message);
      return { session: { kind: "unverified" }, client: null };
    }
    throw error;
  }
}
