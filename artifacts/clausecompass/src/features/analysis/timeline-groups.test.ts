import { describe, expect, it } from "vitest";
import type { TimelineItem } from "@workspace/api-client-react";
import { describeAmbiguity, formatIsoDate, groupTimeline } from "./timeline-groups";

const item = (date: string, paragraph: number, ambiguity: TimelineItem["ambiguity"] = null): TimelineItem => ({
  date,
  asWritten: date,
  ambiguity,
  topics: [],
  claim: {
    text: "x",
    quote: "x",
    source_chunk_ids: [`p${paragraph}`],
    location: { page: null, paragraph, clause: null },
    confidence: 1,
    category: "date",
  },
});

describe("formatIsoDate", () => {
  it("writes the calendar day in words, unaffected by the browser's time zone", () => {
    expect(formatIsoDate("2026-02-24")).toBe("24 February 2026");
    expect(formatIsoDate("2027-01-31")).toBe("31 January 2027");
  });

  it("leaves anything that is not an ISO date alone", () => {
    expect(formatIsoDate("soon")).toBe("soon");
  });
});

describe("groupTimeline", () => {
  it("merges consecutive items on the same day and keeps the order", () => {
    const groups = groupTimeline([item("2026-03-01", 12), item("2026-03-01", 23), item("2026-08-31", 23), item("2027-01-31", 12)]);
    expect(groups.map((group) => [group.date, group.items.length])).toEqual([
      ["2026-03-01", 2],
      ["2026-08-31", 1],
      ["2027-01-31", 1],
    ]);
  });

  it("is empty for no items", () => {
    expect(groupTimeline([])).toEqual([]);
  });
});

describe("describeAmbiguity", () => {
  it("names the other reading of a numeric date", () => {
    const text = describeAmbiguity(item("2027-04-03", 1, { kinds: ["day-month-order"], alternative: "2027-03-04" }));
    expect(text).toContain("4 March 2027");
    expect(text).toContain("Check before relying on it");
  });

  it("explains a two-digit year and says nothing for an unambiguous date", () => {
    expect(describeAmbiguity(item("2026-02-24", 1, { kinds: ["two-digit-year"], alternative: null }))).toContain("two digits");
    expect(describeAmbiguity(item("2026-02-24", 1))).toBeNull();
  });

  it("states every reason when a date is uncertain in more than one way", () => {
    const text = describeAmbiguity(item("2026-04-03", 1, { kinds: ["day-month-order", "two-digit-year"], alternative: "2026-03-04" }));
    expect(text).toContain("4 March 2026");
    expect(text).toContain("two digits");
    expect(text?.endsWith("Check before relying on it.")).toBe(true);
  });
});
