import { describe, expect, it } from "vitest";
import { hasPermission, parseStaffRole } from "./roles";

describe("staff roles (Day 21)", () => {
  it("accepts exactly the two roles the database defines", () => {
    expect(parseStaffRole("editor")).toBe("editor");
    expect(parseStaffRole("administrator")).toBe("administrator");
    for (const value of [
      "Administrator",
      "admin",
      "superuser",
      "",
      " editor",
      null,
      undefined,
      1,
      {},
    ]) {
      expect(parseStaffRole(value)).toBeNull();
    }
  });

  it("follows the permission matrix, and no role means no permission", () => {
    expect(hasPermission("editor", "admin.access")).toBe(true);
    expect(hasPermission("editor", "objects.edit")).toBe(true);
    expect(hasPermission("editor", "objects.publish")).toBe(false);
    expect(hasPermission("editor", "staff.read")).toBe(false);
    expect(hasPermission("administrator", "objects.publish")).toBe(true);
    expect(hasPermission("administrator", "staff.read")).toBe(true);
    expect(hasPermission(null, "admin.access")).toBe(false);
  });
});
