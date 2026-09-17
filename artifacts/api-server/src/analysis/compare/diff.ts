import { normalizeForMatch } from "@workspace/grounding";
import type { Span } from "../verbatim";

/**
 * Word-level difference between two versions of one paragraph. Words are
 * runs of non-whitespace; two words are the same when they normalise the
 * same way (case, curly quotes and dash variants do not count as a change)
 * and, in the first pass, when only the punctuation around them differs, so
 * that a reworded sentence does not also mark every comma that moved. If
 * that pass sees no change although the wording differs, the punctuation is
 * the change (a full stop that became a question mark, a comma that became
 * a semicolon), and a second pass marks the words carrying it. The result
 * is each side's text cut into segments that concatenate back to the
 * original, with the changed runs marked — what the Compare view highlights,
 * and what the change classifier reads.
 */

export interface DiffSegment {
  text: string;
  changed: boolean;
}

export interface SideDiff {
  segments: DiffSegment[];
  /** Character spans (in the original text) of the changed runs. */
  changedSpans: Span[];
}

export interface ParagraphDiff {
  older: SideDiff;
  newer: SideDiff;
}

interface Token {
  key: string;
  start: number;
  end: number;
}

/** Above this many cells the middle section is reported as one changed run instead of aligned word by word. */
export const MAX_DIFF_CELLS = 4_000_000;

/** Punctuation around a word is not part of its identity in the first pass ("notice." and "notice," are the same word); a token that is only punctuation keeps it. */
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

export function tokenKey(word: string, exact = false): string {
  const normalized = normalizeForMatch(word);
  if (exact) return normalized;
  const core = normalized.replace(EDGE_PUNCTUATION, "");
  return core.length > 0 ? core : normalized;
}

export function tokenize(text: string, exact = false): Token[] {
  const tokens: Token[] = [];
  const words = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = words.exec(text)) !== null) {
    tokens.push({ key: tokenKey(match[0], exact), start: match.index, end: match.index + match[0].length });
  }
  return tokens;
}

/** Which tokens of each side are kept by the longest common subsequence of their keys. */
function commonTokens(older: Token[], newer: Token[]): { older: boolean[]; newer: boolean[] } {
  const keptOlder = new Array<boolean>(older.length).fill(false);
  const keptNewer = new Array<boolean>(newer.length).fill(false);

  // Equal prefix and suffix are kept without a table; most edits are local.
  let prefix = 0;
  while (prefix < older.length && prefix < newer.length && older[prefix]!.key === newer[prefix]!.key) prefix += 1;
  let suffix = 0;
  while (
    suffix < older.length - prefix &&
    suffix < newer.length - prefix &&
    older[older.length - 1 - suffix]!.key === newer[newer.length - 1 - suffix]!.key
  ) {
    suffix += 1;
  }
  for (let i = 0; i < prefix; i += 1) {
    keptOlder[i] = true;
    keptNewer[i] = true;
  }
  for (let i = 0; i < suffix; i += 1) {
    keptOlder[older.length - 1 - i] = true;
    keptNewer[newer.length - 1 - i] = true;
  }

  const n = older.length - prefix - suffix;
  const m = newer.length - prefix - suffix;
  if (n === 0 || m === 0 || n * m > MAX_DIFF_CELLS) return { older: keptOlder, newer: keptNewer };

  // Classic LCS table over the middle section; lengths fit in 32 bits comfortably.
  const width = m + 1;
  const table = new Int32Array((n + 1) * width);
  for (let i = 1; i <= n; i += 1) {
    const a = older[prefix + i - 1]!.key;
    for (let j = 1; j <= m; j += 1) {
      table[i * width + j] =
        a === newer[prefix + j - 1]!.key
          ? table[(i - 1) * width + (j - 1)]! + 1
          : Math.max(table[(i - 1) * width + j]!, table[i * width + (j - 1)]!);
    }
  }
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (older[prefix + i - 1]!.key === newer[prefix + j - 1]!.key) {
      keptOlder[prefix + i - 1] = true;
      keptNewer[prefix + j - 1] = true;
      i -= 1;
      j -= 1;
    } else if (table[(i - 1) * width + j]! >= table[i * width + (j - 1)]!) {
      i -= 1;
    } else {
      j -= 1;
    }
  }
  return { older: keptOlder, newer: keptNewer };
}

/**
 * Cuts one side's text at the kept/changed boundaries. A changed run covers
 * exactly its words (first start to last end); the whitespace around it stays
 * with the unchanged text, so highlighting never swallows a space.
 */
function toSide(text: string, tokens: Token[], kept: boolean[]): SideDiff {
  const segments: DiffSegment[] = [];
  const changedSpans: Span[] = [];
  let cursor = 0;
  let index = 0;
  while (index < tokens.length) {
    if (kept[index]) {
      index += 1;
      continue;
    }
    const start = tokens[index]!.start;
    let last = index;
    while (last + 1 < tokens.length && !kept[last + 1]) last += 1;
    const end = tokens[last]!.end;
    if (start > cursor) segments.push({ text: text.slice(cursor, start), changed: false });
    segments.push({ text: text.slice(start, end), changed: true });
    changedSpans.push({ start, end });
    cursor = end;
    index = last + 1;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), changed: false });
  return { segments, changedSpans };
}

export function diffParagraphs(olderText: string, newerText: string): ParagraphDiff {
  const lenient = diffWith(olderText, newerText, false);
  const unchanged = lenient.older.changedSpans.length === 0 && lenient.newer.changedSpans.length === 0;
  if (unchanged && normalizeForMatch(olderText) !== normalizeForMatch(newerText)) return diffWith(olderText, newerText, true);
  return lenient;
}

function diffWith(olderText: string, newerText: string, exact: boolean): ParagraphDiff {
  const olderTokens = tokenize(olderText, exact);
  const newerTokens = tokenize(newerText, exact);
  const kept = commonTokens(olderTokens, newerTokens);
  return {
    older: toSide(olderText, olderTokens, kept.older),
    newer: toSide(newerText, newerTokens, kept.newer),
  };
}

/** The whole text as one changed run: how an added or removed paragraph is presented. */
export function wholeSide(text: string): SideDiff {
  if (text.length === 0) return { segments: [], changedSpans: [] };
  return { segments: [{ text, changed: true }], changedSpans: [{ start: 0, end: text.length }] };
}
