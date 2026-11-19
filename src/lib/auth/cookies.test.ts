// @vitest-environment node
import { createServerClient } from "@supabase/ssr";
import { describe, expect, it, vi } from "vitest";
import { authCookieOptions } from "./cookies";

describe("auth cookie configuration (Day 21 review)", () => {
  it("does not set Secure in development or tests, so local HTTP keeps working", () => {
    for (const env of ["development", "test", undefined]) {
      expect(authCookieOptions(env)).toEqual({ path: "/", sameSite: "lax", secure: false });
    }
  });

  it("sets Secure in production, keeping path and SameSite=Lax", () => {
    expect(authCookieOptions("production")).toEqual({ path: "/", sameSite: "lax", secure: true });
  });

  it("never forces httpOnly (the Supabase SSR session cookie must stay readable)", () => {
    expect(authCookieOptions("production")).not.toHaveProperty("httpOnly");
  });

  it("is what @supabase/ssr actually writes when a session is stored", async () => {
    const fakeJwt = [
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
      Buffer.from(
        JSON.stringify({ sub: "00000000-0000-4000-8000-000000000001", exp: 4102444800 }),
      ).toString("base64url"),
      "signature",
    ].join(".");
    const fetchStub = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: fakeJwt,
            token_type: "bearer",
            expires_in: 3600,
            expires_at: 4102444800,
            refresh_token: "fake-refresh-token",
            user: {
              id: "00000000-0000-4000-8000-000000000001",
              aud: "authenticated",
              role: "authenticated",
              email: "redaktors@example.invalid",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );

    for (const [env, secure] of [
      ["development", false],
      ["production", true],
    ] as const) {
      const written: Array<{ name: string; options: Record<string, unknown> }> = [];
      const client = createServerClient("http://127.0.0.1:54321", "sb_publishable_test", {
        cookieOptions: authCookieOptions(env),
        cookies: {
          getAll: () => [],
          setAll: (cookies) => {
            for (const { name, options } of cookies) {
              written.push({ name, options: options as Record<string, unknown> });
            }
          },
        },
        global: { fetch: fetchStub as unknown as typeof fetch },
      });
      const { error } = await client.auth.signInWithPassword({
        email: "redaktors@example.invalid",
        password: "fake-password",
      });
      expect(error).toBeNull();
      await vi.waitFor(() => expect(written.length).toBeGreaterThan(0));
      const session = written.find(({ name }) => /^sb-.+-auth-token(\.\d+)?$/.test(name));
      expect(session?.options).toMatchObject({
        path: "/",
        sameSite: "lax",
        httpOnly: false,
        secure,
      });
    }
  });
});
