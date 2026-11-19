import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { getStaffSession } from "./session";

const USER = "11111111-2222-4333-8444-555555555555";

/** A fake client: getClaims() and the staff_members lookup, nothing else. */
function fakeClient({
  claims = null as Record<string, unknown> | null,
  claimsError = null as unknown,
  claimsThrows = false,
  role = undefined as unknown,
  roleError = null as unknown,
}) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({
      data: role === undefined ? null : { role },
      error: roleError,
    })),
  };
  const client = {
    auth: {
      getClaims: vi.fn(async () => {
        if (claimsThrows) throw new Error("network");
        return { data: claims ? { claims } : null, error: claimsError };
      }),
    },
    from: vi.fn(() => query),
  };
  return { client: client as unknown as SupabaseClient, query, raw: client };
}

describe("getStaffSession (Day 21)", () => {
  it("is anonymous without a verified session, and says whether a session cookie had expired", async () => {
    expect(await getStaffSession(fakeClient({}).client, { hadSessionCookie: false })).toEqual({
      kind: "anonymous",
      expired: false,
    });
    expect(
      await getStaffSession(fakeClient({ claimsError: { message: "JWT expired" } }).client, {
        hadSessionCookie: true,
      }),
    ).toEqual({ kind: "anonymous", expired: true });
    expect(
      await getStaffSession(fakeClient({ claimsThrows: true }).client, { hadSessionCookie: true }),
    ).toEqual({ kind: "anonymous", expired: true });
  });

  it("rejects claims that are not an authenticated user", async () => {
    for (const claims of [
      { sub: USER, role: "anon" },
      { sub: "not-a-uuid", role: "authenticated" },
      { role: "authenticated" },
    ]) {
      const { client, raw } = fakeClient({ claims, role: "administrator" });
      expect(await getStaffSession(client, { hadSessionCookie: true })).toEqual({
        kind: "anonymous",
        expired: true,
      });
      expect(raw.from).not.toHaveBeenCalled();
    }
  });

  it("reads the role from staff_members for the verified user only", async () => {
    const { client, query, raw } = fakeClient({
      claims: { sub: USER, role: "authenticated", email: "redaktors@example.invalid" },
      role: "editor",
    });
    expect(await getStaffSession(client, { hadSessionCookie: true })).toEqual({
      kind: "staff",
      userId: USER,
      email: "redaktors@example.invalid",
      role: "editor",
    });
    expect(raw.from).toHaveBeenCalledWith("staff_members");
    expect(query.eq).toHaveBeenCalledWith("user_id", USER);
  });

  it("ignores roles claimed in user_metadata, app_metadata or the token", async () => {
    const { client } = fakeClient({
      claims: {
        sub: USER,
        role: "authenticated",
        user_metadata: { role: "administrator" },
        app_metadata: { role: "administrator", staff_role: "administrator" },
        staff_role: "administrator",
      },
      role: undefined,
    });
    expect(await getStaffSession(client, { hadSessionCookie: true })).toEqual({
      kind: "not_staff",
      userId: USER,
      email: null,
    });
  });

  it("denies an unknown role value", async () => {
    const { client } = fakeClient({
      claims: { sub: USER, role: "authenticated" },
      role: "superuser",
    });
    expect((await getStaffSession(client, { hadSessionCookie: true })).kind).toBe("not_staff");
  });

  it("reports an unreadable role as unverified - never as access", async () => {
    const failing = fakeClient({
      claims: { sub: USER, role: "authenticated" },
      roleError: { message: "permission denied", code: "42501" },
    });
    expect(await getStaffSession(failing.client, { hadSessionCookie: true })).toEqual({
      kind: "unverified",
    });
    const throwing = fakeClient({ claims: { sub: USER, role: "authenticated" } });
    throwing.query.maybeSingle.mockRejectedValueOnce(new Error("fetch failed"));
    expect(await getStaffSession(throwing.client, { hadSessionCookie: true })).toEqual({
      kind: "unverified",
    });
  });
});
