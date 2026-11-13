import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublicSupabaseClient, PublicDataConfigurationError } from "./publicClient";

describe("createPublicSupabaseClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws a configuration error when the URL is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");

    expect(() => createPublicSupabaseClient()).toThrow(PublicDataConfigurationError);
  });

  it("throws a configuration error when the publishable key is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");

    expect(() => createPublicSupabaseClient()).toThrow(PublicDataConfigurationError);
  });

  it("never reads the secret key, even when one is set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_must_not_be_used");

    // With only the secret key present the public client must still refuse
    // to build, rather than falling back to a privileged key.
    expect(() => createPublicSupabaseClient()).toThrow(PublicDataConfigurationError);
  });

  it("builds a client when both public variables are set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");

    expect(typeof createPublicSupabaseClient().from).toBe("function");
  });
});
