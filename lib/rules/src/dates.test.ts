import { describe, expect, it } from "vitest";
import { daysBetween, isIsoDate, isoDateSchema } from "./dates";

describe("calendar dates", () => {
  it("accepts real YYYY-MM-DD days and nothing else", () => {
    for (const good of ["2026-09-14", "2024-02-29", "2026-12-31", "0001-01-01"])
      expect(isIsoDate(good), good).toBe(true);
    for (const bad of [
      "2026-02-30",
      "2025-02-29",
      "2026-13-01",
      "2026-00-10",
      "2026-9-14",
      "14-09-2026",
      "2026-09-14T00:00:00Z",
      "",
      20260914,
      null,
    ]) {
      expect(isIsoDate(bad), String(bad)).toBe(false);
    }
    expect(isoDateSchema.safeParse("2026-02-30").success).toBe(false);
    expect(isoDateSchema.parse("2026-02-28")).toBe("2026-02-28");
  });

  it("counts whole days, signed, across month and year ends and leap days", () => {
    expect(daysBetween("2026-09-14", "2026-09-14")).toBe(0);
    expect(daysBetween("2026-09-14", "2026-09-21")).toBe(7);
    expect(daysBetween("2026-09-21", "2026-09-14")).toBe(-7);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
    expect(daysBetween("2025-02-28", "2025-03-01")).toBe(1);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });

  it("does not depend on the process time zone", () => {
    // Dates are days, not instants: a DST change or a negative-offset zone must not shave a day.
    expect(daysBetween("2026-03-01", "2026-04-01")).toBe(31);
    expect(daysBetween("2026-10-01", "2026-11-01")).toBe(31);
  });

  it("throws on malformed input rather than returning NaN", () => {
    expect(() => daysBetween("2026-09-14", "soon")).toThrow(RangeError);
    expect(() => daysBetween("2026-02-30", "2026-03-01")).toThrow(RangeError);
  });
});
