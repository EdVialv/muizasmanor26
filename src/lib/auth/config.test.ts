import { describe, expect, it } from "vitest";
import { AuthConfigurationError, isSupabaseAuthCookie, readAuthConfig } from "./config";

describe("auth configuration (Day 21)", () => {
  it("needs only the public URL and publishable key - no secret key", () => {
    expect(
      readAuthConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
        SUPABASE_SECRET_KEY: "must-not-be-used",
      }),
    ).toEqual({ url: "https://x.supabase.co", publishableKey: "sb_publishable_x" });
    expect(() => readAuthConfig({})).toThrow(AuthConfigurationError);
  });

  it("recognises Supabase session cookies, including split ones", () => {
    expect(isSupabaseAuthCookie("sb-abcdefgh-auth-token")).toBe(true);
    expect(isSupabaseAuthCookie("sb-abcdefgh-auth-token.0")).toBe(true);
    expect(isSupabaseAuthCookie("sb-abcdefgh-auth-token-code-verifier")).toBe(false);
    expect(isSupabaseAuthCookie("session")).toBe(false);
  });
});
