import { describe, expect, it } from "vitest";
import { ADMIN_HOME, safeReturnPath, signInHref } from "./returnPath";

describe("safeReturnPath (Day 21)", () => {
  it.each([
    ["/admin", "/admin"],
    ["/admin/objects", "/admin/objects"],
    ["/admin/objects?cursor=abc&q=pils", "/admin/objects?cursor=abc&q=pils"],
    ["/admin/./objects/../objects", "/admin/objects"],
  ])("keeps the internal admin path %s", (raw, expected) => {
    expect(safeReturnPath(raw)).toBe(expected);
  });

  it.each([
    ["missing", undefined],
    ["not a string", ["/admin"]],
    ["empty", ""],
    ["another origin", "https://evil.example/admin"],
    ["protocol-relative", "//evil.example/admin"],
    ["backslash host", "/\\evil.example/admin"],
    ["backslash", "\\\\evil.example"],
    ["javascript scheme", "javascript:alert(1)"],
    ["data scheme", "data:text/html,<script>"],
    ["encoded scheme", "/%2F%2Fevil.example"],
    ["tab trick", "/\t/evil.example"],
    ["newline", "/admin\nSet-Cookie: x"],
    ["relative path", "admin"],
    ["public page", "/objects"],
    ["prefix lookalike", "/administrator"],
    ["dot-segment escape", "/admin/../objects"],
    ["the sign-in page itself", "/admin/sign-in?next=/admin"],
    ["oversized", `/admin/${"a".repeat(600)}`],
  ])("falls back to /admin for %s", (_label, raw) => {
    expect(safeReturnPath(raw)).toBe(ADMIN_HOME);
  });

  it("drops a fragment", () => {
    expect(safeReturnPath("/admin/objects#top")).toBe("/admin/objects");
  });
});

describe("signInHref", () => {
  it("carries a safe protected path and a fixed reason, never an unsafe one", () => {
    expect(signInHref("/admin")).toBe("/admin/sign-in");
    expect(signInHref("/admin", "expired")).toBe("/admin/sign-in?reason=expired");
    expect(signInHref("/admin/objects")).toBe("/admin/sign-in?next=%2Fadmin%2Fobjects");
    expect(signInHref("https://evil.example/")).toBe("/admin/sign-in");
  });
});
