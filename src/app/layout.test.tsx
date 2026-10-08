import { describe, expect, it } from "vitest";
import { metadata } from "./layout";

describe("root layout metadata", () => {
  it("defines a default title and a template for nested routes", () => {
    expect(metadata.title).toMatchObject({
      default: "Latvijas muižas",
      template: "%s | Latvijas muižas",
    });
  });

  it("defines a non-empty description for search and social previews", () => {
    expect(typeof metadata.description).toBe("string");
    expect((metadata.description ?? "").length).toBeGreaterThan(0);
  });
});
