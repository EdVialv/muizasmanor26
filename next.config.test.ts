import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("next.config", () => {
  it("disables the X-Powered-By header to avoid leaking framework details", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("keeps React Strict Mode on to surface unsafe effects early", () => {
    expect(nextConfig.reactStrictMode).toBe(true);
  });

  it("marks every staff page and endpoint private and noindex (Day 21), and nothing public", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const sources = rules.map((rule) => rule.source);
    expect(sources).toEqual(["/admin", "/admin/:path*", "/api/admin/:path*"]);
    for (const rule of rules) {
      expect(rule.headers).toContainEqual({
        key: "Cache-Control",
        value: "private, no-store, max-age=0",
      });
      expect(rule.headers).toContainEqual({ key: "X-Robots-Tag", value: "noindex, nofollow" });
    }
  });
});
