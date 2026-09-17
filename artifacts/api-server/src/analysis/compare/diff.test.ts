import { describe, expect, it } from "vitest";
import { diffParagraphs, tokenKey, tokenize, wholeSide } from "./diff";

const joined = (segments: { text: string }[]) => segments.map((segment) => segment.text).join("");
const changed = (segments: { text: string; changed: boolean }[]) =>
  segments.filter((segment) => segment.changed).map((segment) => segment.text);

describe("tokenKey", () => {
  it("ignores case, curly quotes and punctuation at the word's edges", () => {
    expect(tokenKey("Notice.")).toBe("notice");
    expect(tokenKey("notice,")).toBe("notice");
    expect(tokenKey("(Rupees")).toBe("rupees");
    expect(tokenKey("months’")).toBe("months");
    expect(tokenKey("month's")).toBe("month's");
  });

  it("keeps a token that is only punctuation", () => {
    expect(tokenKey("-")).toBe("-");
    expect(tokenKey("&")).toBe("&");
  });
});

describe("diffParagraphs", () => {
  it("marks only the words that changed and keeps both texts verbatim", () => {
    const older = "the Licensee shall pay a late payment charge of Rs. 200/- per day of delay.";
    const newer = "the Licensee shall pay a late payment charge of Rs. 500/- per day of delay.";
    const diff = diffParagraphs(older, newer);
    expect(joined(diff.older.segments)).toBe(older);
    expect(joined(diff.newer.segments)).toBe(newer);
    expect(changed(diff.older.segments)).toEqual(["200/-"]);
    expect(changed(diff.newer.segments)).toEqual(["500/-"]);
    expect(diff.older.changedSpans).toEqual([{ start: older.indexOf("200/-"), end: older.indexOf("200/-") + 5 }]);
  });

  it("groups adjacent changed words into one run and leaves the spaces around it unchanged", () => {
    const older = "by giving the other party one (1) month's prior written notice";
    const newer = "by giving the other party two (2) months' prior written notice";
    const diff = diffParagraphs(older, newer);
    expect(changed(diff.older.segments)).toEqual(["one (1) month's"]);
    expect(changed(diff.newer.segments)).toEqual(["two (2) months'"]);
    expect(diff.older.segments.map((segment) => segment.changed)).toEqual([false, true, false]);
  });

  it("shows an insertion on the newer side only", () => {
    const older = "commits a breach that is not remedied within seven (7) days of notice.";
    const newer = "commits a breach that is not remedied within seven (7) days of notice, and in that case the Licensor may forfeit the deposit.";
    const diff = diffParagraphs(older, newer);
    expect(changed(diff.older.segments)).toEqual([]);
    expect(changed(diff.newer.segments)).toEqual(["and in that case the Licensor may forfeit the deposit."]);
  });

  it("treats a change of case or curly quotes as no change", () => {
    const diff = diffParagraphs("The Licensor’s consent", "the licensor's CONSENT");
    expect(diff.older.changedSpans).toEqual([]);
    expect(diff.newer.changedSpans).toEqual([]);
  });

  it("does not mark a word whose surrounding punctuation moved when other words changed", () => {
    const diff = diffParagraphs("one month's notice, or the fee", "two months' notice; or the fee");
    expect(changed(diff.older.segments)).toEqual(["one month's"]);
    expect(changed(diff.newer.segments)).toEqual(["two months'"]);
  });

  it("marks a change that is punctuation only, so it is never reported as no change", () => {
    const diff = diffParagraphs("The deposit is refundable.", "The deposit is refundable?");
    expect(changed(diff.older.segments)).toEqual(["refundable."]);
    expect(changed(diff.newer.segments)).toEqual(["refundable?"]);
    const comma = diffParagraphs("Rent, fees and charges", "Rent; fees and charges");
    expect(changed(comma.older.segments)).toEqual(["Rent,"]);
    expect(changed(comma.newer.segments)).toEqual(["Rent;"]);
  });

  it("marks everything when nothing is shared", () => {
    const diff = diffParagraphs("alpha beta gamma", "delta epsilon");
    expect(changed(diff.older.segments)).toEqual(["alpha beta gamma"]);
    expect(changed(diff.newer.segments)).toEqual(["delta epsilon"]);
  });

  it("aligns a moved-word edit without losing the shared words", () => {
    const older = "a b c d e f";
    const newer = "a c b d e f";
    const diff = diffParagraphs(older, newer);
    expect(joined(diff.older.segments)).toBe(older);
    expect(joined(diff.newer.segments)).toBe(newer);
    // One of the two swapped words is kept on each side; the other is a change.
    expect(changed(diff.older.segments)).toHaveLength(1);
    expect(changed(diff.newer.segments)).toHaveLength(1);
  });

  it("handles empty text", () => {
    expect(tokenize("")).toEqual([]);
    expect(wholeSide("")).toEqual({ segments: [], changedSpans: [] });
    expect(diffParagraphs("", "new words")).toEqual({
      older: { segments: [], changedSpans: [] },
      newer: { segments: [{ text: "new words", changed: true }], changedSpans: [{ start: 0, end: 9 }] },
    });
  });

  it("presents an added or removed paragraph as one changed run", () => {
    expect(wholeSide("3.3 The deposit shall not be adjusted.")).toEqual({
      segments: [{ text: "3.3 The deposit shall not be adjusted.", changed: true }],
      changedSpans: [{ start: 0, end: 38 }],
    });
  });
});
