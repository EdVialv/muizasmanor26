import { describe, expect, it } from "vitest";
import { formatLatvianDate } from "./dates";

describe("formatLatvianDate", () => {
  it("prints a date column as that calendar day", () => {
    expect(formatLatvianDate("2026-10-08")).toBe("2026. gada 8. oktobris");
  });

  it("prints a timestamp as the calendar day it falls on in Latvia", () => {
    // 22:30 UTC on the 8th is already the 9th in Riga (UTC+3 in October).
    expect(formatLatvianDate("2026-10-08T22:30:00+00:00")).toBe("2026. gada 9. oktobris");
    expect(formatLatvianDate("2026-10-08T10:00:00+00:00")).toBe("2026. gada 8. oktobris");
  });

  it("returns null instead of a wrong or invented date", () => {
    expect(formatLatvianDate(null)).toBeNull();
    expect(formatLatvianDate(undefined)).toBeNull();
    expect(formatLatvianDate("")).toBeNull();
    expect(formatLatvianDate("not a date")).toBeNull();
    expect(formatLatvianDate("2026-02-31")).toBeNull();
  });
});
