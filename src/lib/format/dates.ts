/**
 * Latvian date formatting for recorded dates - verification dates, never
 * "today" (docs/DAY15_VISUAL_ALPHA_NOTES.md). Returns null for a missing or
 * unparseable value so the caller prints nothing, rather than a wrong date.
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const dateOnlyFormatter = new Intl.DateTimeFormat("lv-LV", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

const instantFormatter = new Intl.DateTimeFormat("lv-LV", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "Europe/Riga",
});

/**
 * A `date` column ("2026-10-08") is a calendar day and is printed as that
 * day everywhere. A `timestamptz` column is an instant and is printed as
 * the calendar day it falls on in Latvia.
 */
export function formatLatvianDate(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const dateOnly = DATE_ONLY.exec(value.trim());
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    // Reject impossible days such as 2026-02-31, which Date would roll over.
    if (date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) {
      return null;
    }
    return dateOnlyFormatter.format(date);
  }
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    return null;
  }
  return instantFormatter.format(instant);
}
