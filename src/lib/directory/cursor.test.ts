import { describe, expect, it } from "vitest";
import { buildNextPageParams, decodeCursor, encodeCursor } from "./cursor";

const SAMPLE_ID = "11111111-2222-4333-8444-555555555555";
const SAMPLE_ID_2 = "66666666-7777-4888-8999-aaaaaaaaaaaa";

describe("encodeCursor / decodeCursor", () => {
  it("round-trips a simple ASCII name", () => {
    const token = encodeCursor({ name: "Rundāles pils", id: SAMPLE_ID });
    expect(decodeCursor(token)).toEqual({ name: "Rundāles pils", id: SAMPLE_ID });
  });

  it("round-trips a name containing commas, parentheses and diacritics", () => {
    // Real title shape from the Day 11 dataset - exactly the kind of value
    // that would break a hand-built PostgREST or()/and() filter string.
    const name = 'Rundāles pils (ziemeļu spārns, "jaunais korpuss")';
    const token = encodeCursor({ name, id: SAMPLE_ID });
    expect(decodeCursor(token)).toEqual({ name, id: SAMPLE_ID });
  });

  it("produces a URL-safe token (no characters requiring percent-encoding)", () => {
    const token = encodeCursor({ name: "Test / Name + More", id: SAMPLE_ID });
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("returns null for undefined or an empty string", () => {
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });

  it("rejects a non-base64url string outright", () => {
    expect(decodeCursor("not valid base64url!!")).toBeNull();
  });

  it("rejects base64url input that is not valid JSON", () => {
    const token = Buffer.from("not json", "utf8").toString("base64url");
    expect(decodeCursor(token)).toBeNull();
  });

  it("rejects valid JSON that is missing a required field", () => {
    const token = Buffer.from(JSON.stringify({ name: "Only a name" }), "utf8").toString(
      "base64url",
    );
    expect(decodeCursor(token)).toBeNull();
  });

  it("rejects valid JSON with an extra, unexpected field", () => {
    const token = Buffer.from(
      JSON.stringify({ name: "A", id: SAMPLE_ID, extra: "surprise" }),
      "utf8",
    ).toString("base64url");
    expect(decodeCursor(token)).toBeNull();
  });

  it("rejects an id that is not a well-formed UUID", () => {
    const token = Buffer.from(JSON.stringify({ name: "A", id: "not-a-uuid" }), "utf8").toString(
      "base64url",
    );
    expect(decodeCursor(token)).toBeNull();
  });

  it("rejects an empty name", () => {
    const token = Buffer.from(JSON.stringify({ name: "", id: SAMPLE_ID }), "utf8").toString(
      "base64url",
    );
    expect(decodeCursor(token)).toBeNull();
  });

  it("rejects a pathologically long name", () => {
    const token = Buffer.from(
      JSON.stringify({ name: "x".repeat(10_000), id: SAMPLE_ID }),
      "utf8",
    ).toString("base64url");
    expect(decodeCursor(token)).toBeNull();
  });

  it("rejects an oversized token before attempting to decode it", () => {
    expect(decodeCursor("A".repeat(10_000))).toBeNull();
  });

  it("rejects a cursor whose JSON decodes to a non-object (e.g. an array or number)", () => {
    const arrayToken = Buffer.from(JSON.stringify([1, 2]), "utf8").toString("base64url");
    const numberToken = Buffer.from(JSON.stringify(42), "utf8").toString("base64url");
    expect(decodeCursor(arrayToken)).toBeNull();
    expect(decodeCursor(numberToken)).toBeNull();
  });
});

describe("buildNextPageParams", () => {
  it("returns only the encoded next cursor, keeping URL state bounded", () => {
    const params = buildNextPageParams({ name: "B", id: SAMPLE_ID_2 });
    expect(Object.keys(params)).toEqual(["cursor"]);
    expect(decodeCursor(params.cursor)).toEqual({ name: "B", id: SAMPLE_ID_2 });
  });
});
