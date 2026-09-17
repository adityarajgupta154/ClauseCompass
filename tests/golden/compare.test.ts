import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describeLanguageViolation, findLanguageViolations, type SourceChunk } from "@workspace/grounding";
import { compareDocuments, toSourceChunks, type Change } from "../../artifacts/api-server/src/analysis";
import { splitParagraphs } from "../../artifacts/api-server/src/extraction/paragraphs";
import { copy } from "../../artifacts/clausecompass/src/features/journey/copy";

/**
 * Golden run of the two-version comparison (PRD FR-07) over the rental
 * fixture pair. Pinned: which paragraphs differ between the two drafts, how
 * each difference is classified, that every change card carries both
 * excerpts verbatim with the changed words marked, and the acceptance line
 * of the task — the late-fee and notice-period changes are flagged as money
 * and time with both excerpts. Also pinned: a document against itself has no
 * changes, unrelated documents barely align, and the view's own copy stays in
 * the review register.
 */

const root = new URL("../../", import.meta.url);

function loadFixture(file: string): SourceChunk[] {
  const paragraphs = splitParagraphs(readFileSync(new URL(`samples/${file}`, root), "utf8"));
  return toSourceChunks({
    chunks: paragraphs.map((text, index) => ({ text, page: null, paragraphIndex: index + 1 })),
  });
}

const v1 = loadFixture("rental-agreement-synthetic.txt");
const v2 = loadFixture("rental-agreement-v2-synthetic.txt");
const offer = loadFixture("offer-letter-synthetic.txt");

const textOf = (side: NonNullable<Change["older"]>) => side.segments.map((segment) => segment.text).join("");
const changedIn = (side: NonNullable<Change["older"]>) =>
  side.segments.filter((segment) => segment.changed).map((segment) => segment.text);

/** Arguments the copy's sentence functions take: a count, joined file names, a label with a count, a side with its terms, a list of labels. */
const SAMPLE_ARGS: unknown[][] = [[1], [14], ["v1.txt and v2.txt"], ["Money", 2], ["older", ["Rs. 200/-", "Rs. 500/-"]], [["Money", "Time"]]];

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") {
    return SAMPLE_ARGS.flatMap((args) => {
      try {
        const result = (value as (...args: unknown[]) => unknown)(...args);
        return typeof result === "string" ? [result] : [];
      } catch {
        return [];
      }
    });
  }
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

describe("comparing the two rental drafts", () => {
  const result = compareDocuments(v1, v2);
  const byOlderClause = (clause: string) => result.changes.find((change) => change.older?.location.clause === clause);
  const byNewerClause = (clause: string) => result.changes.find((change) => change.newer?.location.clause === clause);

  it("pins which paragraphs differ and how each difference is classified", () => {
    expect(
      result.changes.map((change) => [
        change.status,
        change.kind,
        change.older?.location.clause ?? null,
        change.newer?.location.clause ?? null,
      ]),
    ).toEqual([
      ["changed", "wording", "2.1", "2.1"],
      ["changed", "money", "2.2", "2.2"],
      ["removed", "money", "3.3", null],
      ["changed", "time", "4.2", "4.2"],
      ["changed", "remedy", "4.3", "4.3"],
      ["changed", "duty", "5.4", "5.4"],
      ["added", "duty", null, "5.6"],
    ]);
    expect(result.aligned).toBe(52);
    expect(result.unchanged).toBe(47);
    expect(result.byKind).toEqual({ money: 2, time: 1, duty: 2, remedy: 1, wording: 1 });
    expect(result.changes.map((change) => change.id)).toEqual(["c1", "c2", "c3", "c4", "c5", "c6", "c7"]);
  });

  it("flags the late-fee change as money with both excerpts and both amounts", () => {
    const change = byOlderClause("2.2")!;
    expect(change.kind).toBe("money");
    expect(change.older!.chunkId).toBe("p16");
    expect(change.newer!.chunkId).toBe("p16");
    expect(textOf(change.older!)).toBe(v1[15]!.text);
    expect(textOf(change.newer!)).toBe(v2[15]!.text);
    expect(changedIn(change.older!)).toEqual(["200/-", "Two"]);
    expect(changedIn(change.newer!)).toEqual(["500/-", "Five"]);
    expect(change.values).toEqual({
      older: ["Rs. 200/-", "Rupees Two Hundred only"],
      newer: ["Rs. 500/-", "Rupees Five Hundred only"],
    });
    expect(change.older!.location).toEqual({ page: null, paragraph: 16, clause: "2.2" });
  });

  it("flags the notice-period change as time with both excerpts and both periods", () => {
    const change = byOlderClause("4.2")!;
    expect(change.kind).toBe("time");
    expect(change.signals).toEqual(["time"]);
    expect(textOf(change.older!)).toBe(v1[23]!.text);
    expect(textOf(change.newer!)).toBe(v2[22]!.text);
    expect(changedIn(change.older!)).toEqual(["one (1) month's", "one month's"]);
    expect(changedIn(change.newer!)).toEqual(["two (2) months'", "two months'"]);
    expect(change.values).toEqual({
      older: ["one (1) month's", "one month's"],
      newer: ["two (2) months'", "two months'"],
    });
    // The paragraph moved up by one because 3.3 was dropped; each side keeps its own location.
    expect(change.older!.location.paragraph).toBe(24);
    expect(change.newer!.location.paragraph).toBe(23);
  });

  it("carries the other changes with the right side present", () => {
    expect(byOlderClause("4.3")!.values).toEqual({ older: [], newer: ["forfeit"] });
    expect(byOlderClause("5.4")!.values).toEqual({ older: ["consent"], newer: [] });
    expect(byOlderClause("2.1")!.values).toEqual({ older: [], newer: [] });
    expect(changedIn(byOlderClause("2.1")!.newer!)).toEqual(["or UPI"]);

    const removed = byOlderClause("3.3")!;
    expect(removed.newer).toBeNull();
    expect(removed.older!.segments).toEqual([{ text: v1[20]!.text, changed: true }]);

    const added = byNewerClause("5.6")!;
    expect(added.older).toBeNull();
    expect(added.newer!.segments).toEqual([{ text: v2[30]!.text, changed: true }]);
  });

  it("keeps every excerpt verbatim: the segments of each side concatenate to that side's paragraph", () => {
    const olderById = new Map(v1.map((chunk) => [chunk.id, chunk]));
    const newerById = new Map(v2.map((chunk) => [chunk.id, chunk]));
    for (const change of result.changes) {
      if (change.older) expect(textOf(change.older)).toBe(olderById.get(change.older.chunkId)!.text);
      if (change.newer) expect(textOf(change.newer)).toBe(newerById.get(change.newer.chunkId)!.text);
      expect(change.older !== null || change.newer !== null).toBe(true);
      if (change.status === "changed") {
        expect(change.older).not.toBeNull();
        expect(change.newer).not.toBeNull();
      }
    }
  });

  it("is symmetric in what it pairs: the reverse comparison swaps the sides", () => {
    const reverse = compareDocuments(v2, v1);
    expect(reverse.changes.map((change) => [change.status, change.older?.location.clause ?? null, change.newer?.location.clause ?? null])).toEqual([
      ["changed", "2.1", "2.1"],
      ["changed", "2.2", "2.2"],
      ["added", null, "3.3"],
      ["changed", "4.2", "4.2"],
      ["changed", "4.3", "4.3"],
      ["changed", "5.4", "5.4"],
      ["removed", "5.6", null],
    ]);
    expect(reverse.changes.map((change) => change.kind)).toEqual(result.changes.map((change) => change.kind));
  });
});

describe("comparison edge cases", () => {
  it("finds no change between a document and itself", () => {
    const same = compareDocuments(v1, v1);
    expect(same.changes).toEqual([]);
    expect(same.unchanged).toBe(v1.length);
    expect(same.aligned).toBe(v1.length);
  });

  it("barely aligns two unrelated documents, so nothing is presented as an edit of the other", () => {
    const cross = compareDocuments(v1, offer);
    // The shared synthetic-document notice and the boilerplate governing-law clause are all that pairs.
    expect(cross.aligned).toBeLessThanOrEqual(5);
    expect(cross.changes.filter((change) => change.status === "removed")).toHaveLength(v1.length - cross.aligned);
    expect(cross.changes.filter((change) => change.status === "added")).toHaveLength(offer.length - cross.aligned);
  });
});

describe("Responsible Language in the compare view", () => {
  it("holds for the view's own copy", () => {
    const violations = strings(copy.compare).flatMap((sentence) =>
      findLanguageViolations(sentence).map((violation) => `${describeLanguageViolation(violation)} in "${sentence}"`),
    );
    expect(violations).toEqual([]);
  });
});
