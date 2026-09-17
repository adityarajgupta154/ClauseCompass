import { describe, expect, it } from "vitest";
import type { SourceChunk } from "@workspace/grounding";
import { detectClauseLabel } from "@workspace/rules";
import {
  alignParagraphs,
  AlignmentTooLargeError,
  featuresOf,
  GAP_MATCH_THRESHOLD,
  LABEL_MATCH_THRESHOLD,
  MATCH_THRESHOLD,
  MAX_ALIGN_CELLS,
  similarity,
  wordSimilarity,
} from "./align";

function chunks(texts: string[]): SourceChunk[] {
  return texts.map((text, index) => ({
    id: `p${index + 1}`,
    text,
    location: { page: null, paragraph: index + 1, clause: detectClauseLabel(text)?.label ?? null },
  }));
}

const pairs = (ops: ReturnType<typeof alignParagraphs>) =>
  ops.flatMap((op) => (op.op === "pair" ? [[op.older, op.newer] as const] : []));

describe("similarity", () => {
  it("is 1 for the same wording, whatever the case or quotes", () => {
    const [a, b] = chunks(["The Licensor’s consent is needed.", "the licensor's CONSENT is needed."]);
    expect(similarity(featuresOf(a!), featuresOf(b!))).toBe(1);
  });

  it("is high for a small edit and low for different clauses that share a vocabulary", () => {
    const [edit, other, base] = chunks([
      "2.2 If the licence fee is not received by the 5th day of the month, the Licensee shall pay a late payment charge of Rs. 500/- per day of delay.",
      "2.3 The Licensee shall pay the electricity charges for the Licensed Premises directly to the supplier on the basis of the meter reading.",
      "2.2 If the licence fee is not received by the 5th day of the month, the Licensee shall pay a late payment charge of Rs. 200/- per day of delay.",
    ]);
    expect(similarity(featuresOf(base!), featuresOf(edit!))).toBeGreaterThan(MATCH_THRESHOLD);
    expect(similarity(featuresOf(base!), featuresOf(other!))).toBeLessThan(LABEL_MATCH_THRESHOLD);
  });

  it("leaves the clause number out, so a renumbered clause still reads as the same wording", () => {
    const [a, b] = chunks(["5.6 The Licensee shall keep the premises clean.", "5.7 The Licensee shall keep the premises clean."]);
    expect(similarity(featuresOf(a!), featuresOf(b!))).toBe(1);
  });

  it("matches one-word paragraphs only to the same word", () => {
    const [and, between, longer] = chunks(["AND", "BETWEEN", "AND the Licensee agrees"]);
    expect(similarity(featuresOf(and!), featuresOf(and!))).toBe(1);
    expect(similarity(featuresOf(and!), featuresOf(between!))).toBe(0);
    expect(similarity(featuresOf(and!), featuresOf(longer!))).toBe(0);
  });
});

describe("alignParagraphs", () => {
  const older = chunks([
    "LEAVE AND LICENCE AGREEMENT",
    "2.1 The Licensee shall pay to the Licensor a monthly licence fee of Rs. 18,000/- payable in advance on or before the 5th day of each calendar month.",
    "2.2 If the licence fee is not received by the 5th day of the month, the Licensee shall pay a late payment charge of Rs. 200/- per day of delay.",
    "3.3 The security deposit shall not be adjusted against the licence fee for the last month of the Licence Period.",
    "5.4 The Licensee shall not keep pets in the Licensed Premises without the prior written consent of the Licensor and the society.",
    "5.5 The Licensee shall abide by the rules and bye-laws of the housing society.",
  ]);

  it("pairs identical and edited paragraphs, reports a dropped and an added one in document order", () => {
    const newer = chunks([
      "LEAVE AND LICENCE AGREEMENT",
      "2.1 The Licensee shall pay to the Licensor a monthly licence fee of Rs. 18,000/- payable in advance on or before the 5th day of each calendar month.",
      "2.2 If the licence fee is not received by the 5th day of the month, the Licensee shall pay a late payment charge of Rs. 500/- per day of delay.",
      "5.4 The Licensee shall not keep pets in the Licensed Premises.",
      "5.5 The Licensee shall abide by the rules and bye-laws of the housing society.",
      "5.6 The Licensee shall not park more than one two-wheeler in the allotted parking slot.",
    ]);
    const ops = alignParagraphs(older, newer);
    expect(ops.map((op) => op.op)).toEqual(["pair", "pair", "pair", "removed", "pair", "pair", "added"]);
    expect(pairs(ops)).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
      [4, 3],
      [5, 4],
    ]);
    const edited = ops.find((op) => op.op === "pair" && op.older === 2);
    expect(edited).toMatchObject({ identical: false });
    expect((edited as { similarity: number }).similarity).toBeGreaterThan(MATCH_THRESHOLD);
    const heading = ops.find((op) => op.op === "pair" && op.older === 0);
    expect(heading).toMatchObject({ identical: true, similarity: 1 });
  });

  it("pairs a heavily rewritten clause through its clause number", () => {
    const rewritten = chunks(["5.4 No pets are allowed in the Licensed Premises at any time."]);
    const ops = alignParagraphs([older[4]!], rewritten);
    const pair = ops.find((op) => op.op === "pair");
    expect(pair).toBeDefined();
    expect((pair as { similarity: number }).similarity).toBeLessThan(MATCH_THRESHOLD);
    expect((pair as { similarity: number }).similarity).toBeGreaterThanOrEqual(LABEL_MATCH_THRESHOLD);
  });

  it("does not pair a clause number that now carries unrelated wording", () => {
    const replaced = chunks(["5.4 The Licensor may inspect the Licensed Premises once a month with a day's notice."]);
    expect(alignParagraphs([older[4]!], replaced).map((op) => op.op)).toEqual(["removed", "added"]);
  });

  it("keeps document order: a similar clause later in the other version is not matched out of sequence", () => {
    // 2.2 sits before 2.1 in the newer version; pairing both would need a crossing, so one of them is reported as removed and added.
    const swapped = [older[2]!, older[1]!];
    const ops = alignParagraphs([older[1]!, older[2]!], swapped);
    expect(pairs(ops)).toHaveLength(1);
    expect(ops.filter((op) => op.op !== "pair")).toHaveLength(2);
  });

  it("handles an empty side", () => {
    expect(alignParagraphs([], older.slice(0, 2)).map((op) => op.op)).toEqual(["added", "added"]);
    expect(alignParagraphs(older.slice(0, 2), []).map((op) => op.op)).toEqual(["removed", "removed"]);
    expect(alignParagraphs([], [])).toEqual([]);
  });

  it("pairs a short unnumbered line rewritten in place, which has too few bigrams for the main test", () => {
    const [before] = chunks(["Rent Rs. 100 monthly"]);
    const [after] = chunks(["Rent Rs. 200 monthly"]);
    expect(similarity(featuresOf(before!), featuresOf(after!))).toBeLessThan(MATCH_THRESHOLD);
    expect(wordSimilarity(featuresOf(before!), featuresOf(after!))).toBeGreaterThanOrEqual(GAP_MATCH_THRESHOLD);
    const ops = alignParagraphs(
      chunks(["Schedule of charges", "Rent Rs. 100 monthly", "Payable in advance."]),
      chunks(["Schedule of charges", "Rent Rs. 200 monthly", "Payable in advance."]),
    );
    expect(ops.map((op) => op.op)).toEqual(["pair", "pair", "pair"]);
    expect(ops[1]).toMatchObject({ older: 1, newer: 1, identical: false });
    // The same shape with nothing in common stays removed + added.
    const apart = alignParagraphs(chunks(["Schedule of charges", "Rent Rs. 100 monthly"]), chunks(["Schedule of charges", "Keys handed over."]));
    expect(apart.map((op) => op.op)).toEqual(["pair", "removed", "added"]);
    // Two removed against one added is not a one-for-one gap, so nothing is guessed.
    const block = alignParagraphs(
      chunks(["Schedule of charges", "Rent Rs. 100 monthly", "Deposit Rs. 900", "Payable in advance."]),
      chunks(["Schedule of charges", "Rent Rs. 200 monthly", "Payable in advance."]),
    );
    expect(block.map((op) => op.op)).toEqual(["pair", "removed", "removed", "added", "pair"]);
  });

  it("refuses two versions whose paragraph pairs exceed the table cap before allocating anything", () => {
    const side = Math.ceil(Math.sqrt(MAX_ALIGN_CELLS)); // (side + 1)² > cap, and one side alone is well under it
    const many = chunks(Array.from({ length: side }, () => "AND"));
    expect(() => alignParagraphs(many, many)).toThrow(AlignmentTooLargeError);
    expect(alignParagraphs(many.slice(0, 10), many.slice(0, 10))).toHaveLength(10);
  });

  it("stays within a few seconds at the cap even when every paragraph resembles every other", () => {
    // The worst case for the candidate index: every paragraph shares its bigrams with all the others.
    const side = Math.floor(Math.sqrt(MAX_ALIGN_CELLS)) - 1;
    const texts = Array.from({ length: side }, (_, i) => `The Licensee shall pay the charge for item ${i % 5} without delay.`);
    const older = chunks(texts);
    const newer = chunks(texts.map((text, i) => (i % 3 === 0 ? text.replace("without", "with no") : text)));
    const started = performance.now();
    const ops = alignParagraphs(older, newer);
    const ms = performance.now() - started;
    expect(ms).toBeLessThan(5000);
    expect(ops.filter((op) => op.op === "pair")).toHaveLength(side);
  });

  it("aligns a long document with itself quickly", () => {
    const many = chunks(
      Array.from({ length: 600 }, (_, i) => `${i + 1}. The party of the ${i % 7} part shall perform obligation number ${i} within ${(i % 30) + 1} days.`),
    );
    const started = performance.now();
    const ops = alignParagraphs(many, many);
    expect(performance.now() - started).toBeLessThan(2000);
    expect(ops.every((op) => op.op === "pair" && op.identical)).toBe(true);
  });
});
