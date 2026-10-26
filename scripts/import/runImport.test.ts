import { describe, expect, it } from "vitest";
import { parseArgs } from "./runImport";

const requiredArgs = [
  "--file",
  "sample.csv",
  "--source-system",
  "unit_test",
  "--db-url",
  "postgresql://unused",
];

describe("parseArgs", () => {
  it("accepts a positive integer batch size", () => {
    expect(parseArgs([...requiredArgs, "--batch-size", "25"]).batchSize).toBe(25);
  });

  it.each(["0", "-1", "1.5", "NaN"])("rejects invalid batch size %s", (value) => {
    expect(() => parseArgs([...requiredArgs, "--batch-size", value])).toThrow(
      "--batch-size must be a positive integer",
    );
  });
});
