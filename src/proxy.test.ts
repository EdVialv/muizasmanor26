// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { ssr } = vi.hoisted(() => ({
  ssr: {
    getClaims: vi.fn(),
    refreshCookies: [] as Array<{ name: string; value: string; options: object }>,
    options: null as null | Record<string, unknown>,
  },
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: {
      cookieOptions?: Record<string, unknown>;
      cookies: { setAll: (c: typeof ssr.refreshCookies) => void };
    },
  ) => {
    ssr.options = options;
    const { cookies } = options;
    return {
      auth: {
        getClaims: async () => {
          if (ssr.refreshCookies.length) cookies.setAll(ssr.refreshCookies);
          return ssr.getClaims();
        },
      },
    };
  },
}));

import { authCookieOptions } from "@/lib/auth/cookies";
import { config, proxy } from "./proxy";

const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
};

describe("proxy (Day 21)", () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);
    ssr.getClaims.mockReset().mockResolvedValue({ data: null, error: null });
    ssr.refreshCookies = [];
  });
  afterEach(() => vi.unstubAllEnvs());

  it("runs only for the administration area - public pages never touch a session", () => {
    expect(config.matcher).toEqual(["/admin", "/admin/:path*", "/api/admin/:path*"]);
  });

  it("never redirects or blocks: authorisation is the page's job", async () => {
    const response = await proxy(new NextRequest("http://localhost/admin"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("writes refreshed session cookies to the response", async () => {
    ssr.refreshCookies = [
      { name: "sb-local-auth-token", value: "refreshed", options: { path: "/", sameSite: "lax" } },
    ];
    const response = await proxy(new NextRequest("http://localhost/admin"));
    expect(response.cookies.get("sb-local-auth-token")?.value).toBe("refreshed");
  });

  it("marks staff responses private and noindex", async () => {
    const response = await proxy(new NextRequest("http://localhost/api/admin/session"));
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("survives an unreachable auth server and a missing configuration", async () => {
    ssr.getClaims.mockRejectedValue(new TypeError("fetch failed"));
    expect((await proxy(new NextRequest("http://localhost/admin"))).status).toBe(200);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect((await proxy(new NextRequest("http://localhost/admin"))).status).toBe(200);
  });

  it("passes the shared auth-cookie configuration to the Supabase client", async () => {
    await proxy(new NextRequest("http://localhost/admin"));
    expect(ssr.options?.cookieOptions).toEqual(authCookieOptions());
    expect(ssr.options?.cookieOptions).toMatchObject({ path: "/", sameSite: "lax", secure: false });

    vi.stubEnv("NODE_ENV", "production");
    await proxy(new NextRequest("https://muizas.example/admin"));
    expect(ssr.options?.cookieOptions).toEqual({ path: "/", sameSite: "lax", secure: true });
  });
});
