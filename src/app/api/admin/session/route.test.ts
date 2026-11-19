import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffSession } from "@/lib/auth/session";

const { access } = vi.hoisted(() => ({ access: { session: null as unknown } }));
vi.mock("@/lib/auth/staffAccess", () => ({
  loadStaffAccess: async () => ({ session: access.session, client: null }),
}));

import { GET } from "./route";

async function call(session: StaffSession) {
  access.session = session;
  const response = await GET();
  return { status: response.status, body: await response.json(), headers: response.headers };
}

describe("GET /api/admin/session (Day 21)", () => {
  beforeEach(() => {
    access.session = null;
  });

  it("401 for anonymous callers and expired sessions", async () => {
    expect(await call({ kind: "anonymous", expired: false })).toMatchObject({
      status: 401,
      body: { error: "not_signed_in" },
    });
    expect(await call({ kind: "anonymous", expired: true })).toMatchObject({
      status: 401,
      body: { error: "session_expired" },
    });
  });

  it("403 for a signed-in user without a staff role", async () => {
    const result = await call({ kind: "not_staff", userId: "u", email: "x@example.invalid" });
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ error: "forbidden" });
  });

  it("503 when the role cannot be verified - denied, not assumed", async () => {
    expect((await call({ kind: "unverified" })).status).toBe(503);
  });

  it("200 with the verified role, and nothing else about the user", async () => {
    for (const role of ["editor", "administrator"] as const) {
      const result = await call({ kind: "staff", userId: "u", email: "x@example.invalid", role });
      expect(result).toMatchObject({ status: 200, body: { role } });
      expect(Object.keys(result.body)).toEqual(["role"]);
    }
  });

  it("is never cacheable by a shared cache", async () => {
    for (const session of [
      { kind: "anonymous", expired: false },
      { kind: "staff", userId: "u", email: null, role: "editor" },
    ] as StaffSession[]) {
      const { headers } = await call(session);
      expect(headers.get("cache-control")).toBe("private, no-store, max-age=0");
      expect(headers.get("vary")).toBe("Cookie");
    }
  });
});
