import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("next.config", () => {
  it("disables the X-Powered-By header to avoid leaking framework details", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("keeps React Strict Mode on to surface unsafe effects early", () => {
    expect(nextConfig.reactStrictMode).toBe(true);
  });
});
