import { z } from "zod";

/**
 * Calendar-date arithmetic for the decision flow. Dates are `YYYY-MM-DD`
 * strings with no time zone: a deadline is a day, "today" is the reader's
 * day (the caller supplies it, so the flow itself never reads the clock),
 * and the distance between them is whole days.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtcDay(value: string): number | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  // setUTCFullYear, not Date.UTC: the latter reads years 0–99 as 1900–1999.
  const date = new Date(0);
  date.setUTCFullYear(y, m - 1, d);
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.getTime();
}

/** A real calendar date, `YYYY-MM-DD` (2026-02-30 is refused, not rolled over). */
export const isoDateSchema = z
  .string()
  .regex(ISO_DATE, "expected YYYY-MM-DD")
  .refine((value) => toUtcDay(value) !== null, "not a calendar date");
export type IsoDate = z.infer<typeof isoDateSchema>;

export function isIsoDate(value: unknown): value is IsoDate {
  return typeof value === "string" && toUtcDay(value) !== null;
}

const DAY_MS = 86_400_000;

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const start = toUtcDay(from);
  const end = toUtcDay(to);
  if (start === null || end === null)
    throw new RangeError(`daysBetween: expected YYYY-MM-DD dates, got ${from} and ${to}`);
  return Math.round((end - start) / DAY_MS);
}
