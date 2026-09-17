import { describe, expect, it } from "vitest";
import { classifyChange, MAX_VALUES } from "./classify";
import { diffParagraphs, wholeSide } from "./diff";

function classifyPair(older: string, newer: string) {
  const diff = diffParagraphs(older, newer);
  return classifyChange({ text: older, diff: diff.older }, { text: newer, diff: diff.newer });
}

const added = (text: string) => classifyChange(null, { text, diff: wholeSide(text) });
const removed = (text: string) => classifyChange({ text, diff: wholeSide(text) }, null);

describe("classifyChange", () => {
  it("reads an amount change as money and reports both amounts", () => {
    const result = classifyPair(
      "the Licensee shall pay a late payment charge of Rs. 200/- (Rupees Two Hundred only) per day of delay.",
      "the Licensee shall pay a late payment charge of Rs. 500/- (Rupees Five Hundred only) per day of delay.",
    );
    expect(result.kind).toBe("money");
    expect(result.values).toEqual({
      older: ["Rs. 200/-", "Rupees Two Hundred only"],
      newer: ["Rs. 500/-", "Rupees Five Hundred only"],
    });
  });

  it("reads a period change as time, with the periods as written", () => {
    const result = classifyPair(
      "either party may terminate this Agreement by giving one (1) month's prior written notice.",
      "either party may terminate this Agreement by giving two (2) months' prior written notice.",
    );
    expect(result.kind).toBe("time");
    expect(result.signals).toEqual(["time"]);
    expect(result.values).toEqual({ older: ["one (1) month's"], newer: ["two (2) months'"] });
  });

  it("reads a date change as time", () => {
    const result = classifyPair("This offer is valid until 15 March 2026.", "This offer is valid until 31 March 2026.");
    expect(result.kind).toBe("time");
    expect(result.values.newer).toEqual(["31 March 2026"]);
  });

  it("reads a new consequence of breach as remedy even when money and modal words come with it", () => {
    const result = classifyPair(
      "a breach that is not remedied within seven (7) days of notice.",
      "a breach that is not remedied within seven (7) days of notice, and in that case the Licensor may forfeit the security deposit.",
    );
    expect(result.kind).toBe("remedy");
    expect(result.signals[0]).toBe("remedy");
    expect(result.signals).toContain("money");
    expect(result.values).toEqual({ older: [], newer: ["forfeit"] });
  });

  it("reads a dropped consent route as duty", () => {
    const result = classifyPair(
      "The Licensee shall not keep pets in the Licensed Premises without the prior written consent of the Licensor.",
      "The Licensee shall not keep pets in the Licensed Premises.",
    );
    expect(result.kind).toBe("duty");
    expect(result.values).toEqual({ older: ["consent"], newer: [] });
  });

  it("reads a duty moving from one party to the other as duty", () => {
    const result = classifyPair(
      "The Licensor shall pay the society maintenance charges.",
      "The Licensee shall pay the society maintenance charges.",
    );
    expect(result.kind).toBe("duty");
    expect(result.values).toEqual({ older: ["licensor"], newer: ["licensee"] });
  });

  it("reads a modal flip as duty", () => {
    const result = classifyPair("The Licensee may sublet the premises.", "The Licensee shall not sublet the premises.");
    expect(result.kind).toBe("duty");
  });

  it("falls back to wording when nothing it knows is in the changed words", () => {
    const result = classifyPair(
      "payable by bank transfer to the account notified by the Licensor in writing.",
      "payable by bank transfer or UPI to the account notified by the Licensor in writing.",
    );
    expect(result).toEqual({ kind: "wording", signals: [], values: { older: [], newer: [] } });
  });

  it("ignores topic words outside the changed run", () => {
    // "notice" and "terminate" are untouched; only the address changed.
    const result = classifyPair(
      "Notice to terminate shall be sent to 14 Rose Lane, Pune.",
      "Notice to terminate shall be sent to 22 Lily Road, Pune.",
    );
    expect(result.kind).toBe("wording");
  });

  it("classifies an added or removed paragraph from its whole text", () => {
    expect(added("5.6 The Licensee shall not park more than one two-wheeler in the allotted parking slot.").kind).toBe("duty");
    expect(removed("3.3 The security deposit shall not be adjusted against the licence fee for the last month.").kind).toBe("money");
    expect(added("9.2 Any dispute shall be referred to arbitration in Mumbai.").kind).toBe("remedy");
  });

  it("counts the same word once and does not count a word inside a longer match", () => {
    const result = added("The Licensee shall not park here and shall not park there.");
    expect(result.values.newer).toEqual(["shall not"]);
  });

  it("breaks ties in a fixed order: money before time before remedy before duty", () => {
    // One amount and one period, both weight 3.
    expect(classifyPair("pay Rs. 100/- within 10 days", "pay Rs. 200/- within 20 days").kind).toBe("money");
    expect(classifyPair("terminate within 10 days", "forfeit within 20 days").kind).toBe("time");
  });

  it("caps the reported values per side", () => {
    const older = Array.from({ length: 8 }, (_, i) => `Rs. ${i + 1}00/-`).join(", ");
    const newer = Array.from({ length: 8 }, (_, i) => `Rs. ${i + 5}00/-`).join(", ");
    const result = classifyPair(older, newer);
    expect(result.kind).toBe("money");
    expect(result.values.older.length).toBeLessThanOrEqual(MAX_VALUES);
    expect(result.values.newer.length).toBeLessThanOrEqual(MAX_VALUES);
  });
});
