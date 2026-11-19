import { NextResponse } from "next/server";
import { loadStaffAccess } from "@/lib/auth/staffAccess";

/**
 * GET /api/admin/session (Day 21): the caller's staff role, verified on the
 * server for this request - for the Day 22 admin client and for tests.
 *
 *   401 - not signed in (or the session is no longer valid)
 *   403 - signed in without a staff role
 *   503 - the role could not be verified (denied, not assumed)
 *   200 - { role: "editor" | "administrator" }
 *
 * Responses are personal: never cached by a shared cache.
 */
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
  "X-Robots-Tag": "noindex, nofollow",
};

export async function GET() {
  const { session } = await loadStaffAccess();
  switch (session.kind) {
    case "anonymous":
      return NextResponse.json(
        { error: session.expired ? "session_expired" : "not_signed_in" },
        { status: 401, headers: PRIVATE_HEADERS },
      );
    case "not_staff":
      return NextResponse.json({ error: "forbidden" }, { status: 403, headers: PRIVATE_HEADERS });
    case "unverified":
      return NextResponse.json({ error: "unverified" }, { status: 503, headers: PRIVATE_HEADERS });
    case "staff":
      return NextResponse.json({ role: session.role }, { status: 200, headers: PRIVATE_HEADERS });
  }
}
