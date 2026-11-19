import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store, ssr } = vi.hoisted(() => ({
  store: {
    cookies: [] as Array<{ name: string; value: string }>,
    set: vi.fn(),
  },
  ssr: { options: null as null | Record<string, unknown> },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => store.cookies, set: store.set }),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: Record<string, unknown>) => {
    ssr.options = options;
    return { auth: {} };
  },
}));

import { authCookieOptions } from "./cookies";
import { createAuthServerClient } from "./serverClient";

type CookieMethods = {
  setAll: (cookies: Array<{ name: string; value: string; options: object }>) => void;
};

describe("createAuthServerClient (Day 21)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    store.cookies = [];
    store.set.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("uses the same shared cookie configuration as the proxy", async () => {
    await createAuthServerClient();
    expect(ssr.options?.cookieOptions).toEqual(authCookieOptions());
    vi.stubEnv("NODE_ENV", "production");
    await createAuthServerClient();
    expect(ssr.options?.cookieOptions).toEqual({ path: "/", sameSite: "lax", secure: true });
  });

  it("reports whether a Supabase session cookie was sent", async () => {
    expect((await createAuthServerClient()).hadSessionCookie).toBe(false);
    store.cookies = [{ name: "sb-local-auth-token.0", value: "x" }];
    expect((await createAuthServerClient()).hadSessionCookie).toBe(true);
  });

  it("writes refreshed cookies, and ignores the write a Server Component cannot make", async () => {
    await createAuthServerClient();
    const { setAll } = ssr.options?.cookies as CookieMethods;
    setAll([{ name: "sb-local-auth-token", value: "v", options: { secure: false } }]);
    expect(store.set).toHaveBeenCalledWith("sb-local-auth-token", "v", { secure: false });
    store.set.mockImplementation(() => {
      throw new Error("Cookies can only be modified in a Server Action or Route Handler");
    });
    expect(() => setAll([{ name: "sb-local-auth-token", value: "v", options: {} }])).not.toThrow();
  });
});
