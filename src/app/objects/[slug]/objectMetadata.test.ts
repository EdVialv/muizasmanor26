import { describe, expect, it } from "vitest";
import type { ObjectDetail } from "@/lib/objects/detail";
import { sparseObjectDetail } from "@/test-support/objectFixtures";
import { buildObjectMetadata, truncateForDescription } from "./objectMetadata";

const OBJECT: ObjectDetail = sparseObjectDetail({ municipality: "Bauskas novads" });

describe("buildObjectMetadata", () => {
  it("describes a record with no summary by its type and municipality only", () => {
    expect(buildObjectMetadata(OBJECT)).toEqual({
      title: "Rundāles pils",
      description: "Pils, Bauskas novads",
    });
  });

  it("uses only the type when there is no municipality either", () => {
    expect(buildObjectMetadata({ ...OBJECT, municipality: null }).description).toBe("Pils");
  });
});

describe("truncateForDescription", () => {
  it("leaves a short summary untouched and collapses whitespace", () => {
    expect(truncateForDescription("Īss  apraksts.\n\nOtra rindkopa.")).toBe(
      "Īss apraksts. Otra rindkopa.",
    );
  });

  it("cuts a long summary on a word boundary within 160 characters", () => {
    const long = "vārds ".repeat(60).trim();
    const result = truncateForDescription(long);

    expect(result.length).toBeLessThanOrEqual(160);
    expect(result.endsWith("…")).toBe(true);
    expect(result.slice(0, -1).endsWith("vārds")).toBe(true);
  });
});
