import { normalizeForMatch, type SourceChunk } from "@workspace/grounding";

/**
 * Pairs the paragraphs of two versions of one document. Two paragraphs are
 * the same clause when their wording largely overlaps (word bigrams, Dice
 * coefficient) or when they carry the same clause number and still share a
 * fair part of their wording. Pairs are chosen in document order — a
 * monotonic alignment, like a line diff — so a clause is matched to the
 * clause in the same place of the other version, not to a similar-sounding
 * one elsewhere. A clause that moved shows as removed and added.
 */

export type AlignmentOp =
  | { op: "pair"; older: number; newer: number; similarity: number; identical: boolean }
  | { op: "removed"; older: number }
  | { op: "added"; newer: number };

/** Wording overlap at or above this pairs two paragraphs on its own. */
export const MATCH_THRESHOLD = 0.6;
/** With the same clause label, this much overlap is enough (a rewritten clause keeps its number and its topic words). */
export const LABEL_MATCH_THRESHOLD = 0.2;
/** Added to the pair's score so that, between two equally similar candidates, the same-numbered one wins. */
const LABEL_BONUS = 0.05;
/**
 * When exactly one paragraph was removed and exactly one added in the same
 * place, they are the same clause rewritten if they still share this much
 * of their words (single words, not bigrams: a short unnumbered line such as
 * "Rent Rs. 100" → "Rent Rs. 200" has too few bigrams to pass the test above).
 */
export const GAP_MATCH_THRESHOLD = 0.3;
/**
 * The alignment table has (older + 1) × (newer + 1) cells, and building the
 * candidate index costs in the same order. Past this many the request is
 * refused rather than run: 2,000 paragraphs a side covers any 50-page
 * contract, while the word cap alone would allow 30,000 one-word paragraphs
 * a side and a table of 900 million cells.
 */
export const MAX_ALIGN_CELLS = 4_000_000;

/** Thrown before any table is allocated when the two versions are too long to line up; the route answers 422. */
export class AlignmentTooLargeError extends Error {
  constructor(
    readonly older: number,
    readonly newer: number,
  ) {
    super(`Cannot align ${older} × ${newer} paragraphs; the limit is ${MAX_ALIGN_CELLS} pairs.`);
    this.name = "AlignmentTooLargeError";
  }
}

interface Features {
  /** Word bigrams, or the words themselves for a one-word paragraph, with the clause label left out. */
  features: Set<string>;
  /** The same words singly, for the singleton-gap test. */
  words: Set<string>;
  label: string | null;
  normalized: string;
}

export function featuresOf(chunk: SourceChunk): Features {
  const normalized = normalizeForMatch(chunk.text);
  let words = normalized.split(" ").filter((word) => word.length > 0);
  const label = chunk.location.clause;
  if (label) {
    const labelWords = normalizeForMatch(label).split(" ");
    if (labelWords.every((word, index) => words[index] === word)) words = words.slice(labelWords.length);
  }
  const features = new Set<string>();
  if (words.length >= 2) {
    for (let i = 0; i + 1 < words.length; i += 1) features.add(`${words[i]} ${words[i + 1]}`);
  } else {
    for (const word of words) features.add(`w:${word}`);
  }
  return { features, words: new Set(words), label, normalized };
}

function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const item of small) if (large.has(item)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

/** Dice coefficient over the two feature sets: 1 for the same wording, 0 for nothing in common. */
export function similarity(a: Features, b: Features): number {
  if (a.normalized === b.normalized) return 1;
  return dice(a.features, b.features);
}

/** Dice coefficient over the words themselves; the looser test used only inside a one-for-one gap. */
export function wordSimilarity(a: Features, b: Features): number {
  if (a.normalized === b.normalized) return 1;
  return dice(a.words, b.words);
}

/**
 * Shared-feature counts for every (older, newer) pair, through an inverted
 * index over the older side, so unrelated paragraphs cost nothing beyond
 * their row. One dense row per newer paragraph (2 bytes a cell, 8 MB at the
 * cap) rather than a map: the worst case, where every paragraph shares its
 * bigrams with every other, is millions of increments.
 */
function sharedCounts(older: Features[], newer: Features[]): Uint16Array[] {
  const index = new Map<string, number[]>();
  older.forEach((entry, i) => {
    for (const feature of entry.features) {
      const list = index.get(feature);
      if (list) list.push(i);
      else index.set(feature, [i]);
    }
  });
  return newer.map((entry) => {
    const counts = new Uint16Array(older.length);
    for (const feature of entry.features) {
      const list = index.get(feature);
      if (!list) continue;
      for (let k = 0; k < list.length; k += 1) counts[list[k]!] += 1;
    }
    return counts;
  });
}

export function alignParagraphs(older: SourceChunk[], newer: SourceChunk[]): AlignmentOp[] {
  const n = older.length;
  const m = newer.length;
  if ((n + 1) * (m + 1) > MAX_ALIGN_CELLS) throw new AlignmentTooLargeError(n, m);
  const a = older.map(featuresOf);
  const b = newer.map(featuresOf);
  const shared = sharedCounts(a, b);

  const pairScore = (i: number, j: number): { score: number; similarity: number } | null => {
    const fa = a[i]!;
    const fb = b[j]!;
    const identical = fa.normalized === fb.normalized;
    const count = shared[j]![i]!;
    const sim = identical ? 1 : count === 0 ? 0 : (2 * count) / (fa.features.size + fb.features.size);
    const sameLabel = fa.label !== null && fa.label === fb.label;
    if (sim < MATCH_THRESHOLD && !(sameLabel && sim >= LABEL_MATCH_THRESHOLD)) return null;
    return { score: sim + (sameLabel ? LABEL_BONUS : 0), similarity: sim };
  };

  // Weighted longest common subsequence: best[i][j] = best total score of aligning older[0..i) with newer[0..j).
  const width = m + 1;
  const best = new Float32Array((n + 1) * width);
  const choice = new Uint8Array((n + 1) * width); // 1 = pair, 2 = older removed, 3 = newer added
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      // Ties go to "added" so that, read forwards, a replaced block lists what was removed before what was added.
      let score = best[(i - 1) * width + j]!;
      let pick = 2;
      const left = best[i * width + (j - 1)]!;
      if (left >= score) {
        score = left;
        pick = 3;
      }
      const pair = pairScore(i - 1, j - 1);
      if (pair) {
        const diagonal = best[(i - 1) * width + (j - 1)]! + pair.score;
        if (diagonal > score) {
          score = diagonal;
          pick = 1;
        }
      }
      best[i * width + j] = score;
      choice[i * width + j] = pick;
    }
  }

  const ops: AlignmentOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const pick = i === 0 ? 3 : j === 0 ? 2 : choice[i * width + j];
    if (pick === 1) {
      const pair = pairScore(i - 1, j - 1)!;
      ops.push({
        op: "pair",
        older: i - 1,
        newer: j - 1,
        similarity: pair.similarity,
        identical: a[i - 1]!.normalized === b[j - 1]!.normalized,
      });
      i -= 1;
      j -= 1;
    } else if (pick === 2) {
      ops.push({ op: "removed", older: i - 1 });
      i -= 1;
    } else {
      ops.push({ op: "added", newer: j - 1 });
      j -= 1;
    }
  }
  return pairSingletonGaps(ops.reverse(), a, b);
}

/**
 * Second pass: a gap between two matched pairs (or a document end) that
 * holds exactly one removed and one added paragraph is the same paragraph
 * rewritten, if the two still share enough words. Any other gap shape is
 * left alone; guessing inside a block rewrite would pair unrelated clauses.
 */
function pairSingletonGaps(ops: AlignmentOp[], a: Features[], b: Features[]): AlignmentOp[] {
  const result: AlignmentOp[] = [];
  let gap: AlignmentOp[] = [];
  const flush = () => {
    if (gap.length === 2 && gap[0]!.op !== gap[1]!.op) {
      const removed = gap.find((op): op is Extract<AlignmentOp, { op: "removed" }> => op.op === "removed")!;
      const added = gap.find((op): op is Extract<AlignmentOp, { op: "added" }> => op.op === "added")!;
      const sim = wordSimilarity(a[removed.older]!, b[added.newer]!);
      if (sim >= GAP_MATCH_THRESHOLD) {
        result.push({
          op: "pair",
          older: removed.older,
          newer: added.newer,
          similarity: sim,
          identical: a[removed.older]!.normalized === b[added.newer]!.normalized,
        });
        gap = [];
        return;
      }
    }
    result.push(...gap);
    gap = [];
  };
  for (const op of ops) {
    if (op.op === "pair") {
      flush();
      result.push(op);
    } else {
      gap.push(op);
    }
  }
  flush();
  return result;
}
