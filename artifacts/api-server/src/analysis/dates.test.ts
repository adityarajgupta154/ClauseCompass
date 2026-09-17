import { describe, expect, it } from "vitest";
import type { SourceChunk } from "@workspace/grounding";
import { evaluateRules } from "@workspace/rules";
import { buildTimeline, findDates } from "./dates";

const chunk = (id: number, text: string): SourceChunk => ({
  id: `p${id}`,
  text,
  location: { page: null, paragraph: id, clause: null },
});

describe("findDates", () => {
  it.each([
    ["is made at Pune on this 24th day of February 2026,", "2026-02-24", "24th day of February 2026"],
    ["for eleven months commencing on 1 March 2026.", "2026-03-01", "1 March 2026"],
    ["Your expected date of joining is Monday, 5 October 2026.", "2026-10-05", "Monday, 5 October 2026"],
    ["valid until 5:00 p.m. on Friday, 25 September 2026.", "2026-09-25", "Friday, 25 September 2026"],
    ["Date: 12 September 2026", "2026-09-12", "12 September 2026"],
    ["on the 5th of April, 2026 at the latest", "2026-04-05", "5th of April, 2026"],
    ["signed on 1st April, 2026.", "2026-04-01", "1st April, 2026"],
    ["Effective February 24, 2026.", "2026-02-24", "February 24, 2026"],
    ["Effective Sept. 5, 2026.", "2026-09-05", "Sept. 5, 2026"],
    ["Dated 24/02/2026.", "2026-02-24", "24/02/2026"],
    ["Dated 24.02.2026.", "2026-02-24", "24.02.2026"],
    ["Dated 2026-02-24.", "2026-02-24", "2026-02-24"],
    ["possession by 15 JUNE 2026", "2026-06-15", "15 JUNE 2026"],
  ])("reads %j as %s", (text, date, asWritten) => {
    const found = findDates(text);
    expect(found).toHaveLength(1);
    expect(found[0]!.date).toBe(date);
    expect(found[0]!.asWritten).toBe(asWritten);
    expect(found[0]!.ambiguity).toBeNull();
    expect(text.slice(found[0]!.span.start, found[0]!.span.end)).toBe(asWritten);
  });

  it("finds every date in a paragraph, in order, without overlaps", () => {
    const text = "from 1 March 2026 to 31 August 2026, renewable by 31/01/2027 or Feb 1, 2027.";
    expect(findDates(text).map((mention) => mention.date)).toEqual([
      "2026-03-01",
      "2026-08-31",
      "2027-01-31",
      "2027-02-01",
    ]);
  });

  it("labels a numeric date whose day and month could be swapped, taking the day-first reading", () => {
    const [found] = findDates("Vacant possession by 03/04/2026.");
    expect(found?.date).toBe("2026-04-03");
    expect(found?.ambiguity).toEqual({ kinds: ["day-month-order"], alternative: "2026-03-04" });
  });

  it("does not label numeric dates that read only one way", () => {
    expect(findDates("by 24/02/2026")[0]?.ambiguity).toBeNull();
    expect(findDates("by 02/24/2026")[0]).toMatchObject({ date: "2026-02-24", ambiguity: null });
    expect(findDates("by 05/05/2026")[0]).toMatchObject({ date: "2026-05-05", ambiguity: null });
  });

  it("labels a two-digit year and reads it as this century", () => {
    const [found] = findDates("Signed on 24-02-26 at Pune.");
    expect(found?.date).toBe("2026-02-24");
    expect(found?.ambiguity).toEqual({ kinds: ["two-digit-year"], alternative: null });
  });

  it("says both when a date is uncertain in both ways", () => {
    const [found] = findDates("Possession by 03/04/26.");
    expect(found?.date).toBe("2026-04-03");
    expect(found?.ambiguity).toEqual({ kinds: ["day-month-order", "two-digit-year"], alternative: "2026-03-04" });
  });

  it("reads a dotted two-digit year only when the day and month are two digits too", () => {
    expect(findDates("Dated 24.02.26.")[0]).toMatchObject({ date: "2026-02-24", ambiguity: { kinds: ["two-digit-year"] } });
    expect(findDates("see clause 1.2.26 above")).toEqual([]);
    expect(findDates("see clause 12.2.26 above")).toEqual([]);
  });

  it("reads a lower-case month name when a day and a full year surround it", () => {
    expect(findDates("vacate by 5 may 2026")[0]).toMatchObject({ date: "2026-05-05", asWritten: "5 may 2026" });
  });

  it.each([
    "the Maharashtra Rent Control Act, 1999 and the Arbitration and Conciliation Act, 1996",
    "on or before the 5th day of each calendar month",
    "salary will be reviewed annually in April",
    "the premises at Survey No. 88/2, Wakad, Pune 411057",
    "CIN U72900KA2019PTC000000, telephone 080-2345-6789",
    "Reference: VLS/HR/OL/2026/0417",
    "Date: ____________",
    "clauses 1.1, 2.2 and 1.2.10 above",
    "in April 2027 or by the year 2030",
    "the Company may 30 days later",
    "on 30/02/2026 or 13/13/2026",
    "version 1.2.3, released 2026",
    "the sum of Rs. 18,000/- on 24 Feb",
  ])("does not read a date into %j", (text) => {
    expect(findDates(text)).toEqual([]);
  });
});

describe("buildTimeline", () => {
  const chunks = [
    chunk(1, "This Agreement is made on 24th day of February 2026 at Pune."),
    chunk(2, "1. TERM"),
    chunk(3, "1.1 The licence runs from 1 March 2026 to 31 January 2027, a period of eleven months."),
    chunk(4, "4.1 The first six months, from 1 March 2026 to 31 August 2026, shall be a lock-in period."),
    chunk(5, "Rent is payable on or before the 5th day of each month."),
  ];
  const hits = evaluateRules(chunks, { stage: "before-signing" });
  const items = buildTimeline(chunks, hits);

  it("lists every explicit date earliest first, one item per paragraph it appears in", () => {
    expect(items.map((item) => [item.date, item.claim.location.paragraph])).toEqual([
      ["2026-02-24", 1],
      ["2026-03-01", 3],
      ["2026-03-01", 4],
      ["2026-08-31", 4],
      ["2027-01-31", 3],
    ]);
  });

  it("grounds each item in the sentence it was found in, quoting the date as written", () => {
    const lockIn = items.find((item) => item.date === "2026-08-31")!;
    expect(lockIn.claim).toMatchObject({
      source_chunk_ids: ["p4"],
      location: { paragraph: 4 },
      quote: "31 August 2026",
      category: "date",
      confidence: 1,
    });
    expect(lockIn.claim.text).toBe(chunks[3]!.text);
    expect(chunks[3]!.text).toContain(lockIn.claim.quote);
  });

  it("attaches the titles of the rules that fired on the same paragraph, except the date rule itself", () => {
    const lockIn = items.find((item) => item.date === "2026-08-31")!;
    expect(lockIn.topics).toContain("Lock-in or minimum period");
    expect(lockIn.topics).not.toContain("A specific calendar date");
    expect(items[0]!.topics).toEqual([]);
  });

  it("leaves relative and partial dates off the timeline", () => {
    expect(items.some((item) => item.claim.location.paragraph === 5)).toBe(false);
    expect(buildTimeline([chunk(1, "Notice of thirty days, reviewed each April.")])).toEqual([]);
  });
});
