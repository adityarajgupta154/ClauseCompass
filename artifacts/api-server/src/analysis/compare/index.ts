import type { SourceChunk, SourceLocation } from "@workspace/grounding";
import { alignParagraphs } from "./align";
import { CHANGE_KINDS, classifyChange, type ChangeKind } from "./classify";
import { diffParagraphs, wholeSide, type DiffSegment } from "./diff";

export {
  alignParagraphs,
  AlignmentTooLargeError,
  featuresOf,
  GAP_MATCH_THRESHOLD,
  LABEL_MATCH_THRESHOLD,
  MATCH_THRESHOLD,
  MAX_ALIGN_CELLS,
  similarity,
  wordSimilarity,
  type AlignmentOp,
} from "./align";
export { CHANGE_KINDS, classifyChange, MAX_VALUES, type ChangeKind, type Classification } from "./classify";
export { diffParagraphs, MAX_DIFF_CELLS, tokenize, tokenKey, wholeSide, type DiffSegment, type ParagraphDiff } from "./diff";

/**
 * The Compare view (PRD FR-07): the two versions' paragraphs aligned, every
 * difference classified, and both sides' wording carried verbatim with the
 * changed words marked. No model call: alignment, diff and classification
 * are deterministic, so the same two files always give the same cards.
 */

export const CHANGE_STATUSES = ["changed", "added", "removed"] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

export interface ChangeSide {
  chunkId: string;
  location: SourceLocation;
  /** The paragraph, whole and verbatim, cut where the wording changed. */
  segments: DiffSegment[];
}

export interface Change {
  id: string;
  status: ChangeStatus;
  kind: ChangeKind;
  signals: ChangeKind[];
  older: ChangeSide | null;
  newer: ChangeSide | null;
  values: { older: string[]; newer: string[] };
}

export interface Comparison {
  /** In document order: by position in the newer version, a removed paragraph where it used to sit. */
  changes: Change[];
  /** Paragraphs aligned with identical wording (case, quote and dash variants aside). */
  unchanged: number;
  /** Aligned pairs, changed or not; the rest of each version is added or removed. */
  aligned: number;
  byKind: Record<ChangeKind, number>;
}

function side(chunk: SourceChunk, segments: DiffSegment[]): ChangeSide {
  return { chunkId: chunk.id, location: chunk.location, segments };
}

export function compareDocuments(older: SourceChunk[], newer: SourceChunk[]): Comparison {
  const changes: Change[] = [];
  let unchanged = 0;
  let aligned = 0;
  const byKind = Object.fromEntries(CHANGE_KINDS.map((kind) => [kind, 0])) as Record<ChangeKind, number>;

  const push = (change: Omit<Change, "id">) => {
    changes.push({ id: `c${changes.length + 1}`, ...change });
    byKind[change.kind] += 1;
  };

  for (const op of alignParagraphs(older, newer)) {
    if (op.op === "pair") {
      aligned += 1;
      const before = older[op.older]!;
      const after = newer[op.newer]!;
      const diff = diffParagraphs(before.text, after.text);
      // Identical wording (the word diff finds a change whenever the normalised texts differ, punctuation included).
      if (op.identical || (diff.older.changedSpans.length === 0 && diff.newer.changedSpans.length === 0)) {
        unchanged += 1;
        continue;
      }
      const classification = classifyChange(
        { text: before.text, diff: diff.older },
        { text: after.text, diff: diff.newer },
      );
      push({
        status: "changed",
        kind: classification.kind,
        signals: classification.signals,
        older: side(before, diff.older.segments),
        newer: side(after, diff.newer.segments),
        values: classification.values,
      });
    } else if (op.op === "removed") {
      const before = older[op.older]!;
      const diff = wholeSide(before.text);
      const classification = classifyChange({ text: before.text, diff }, null);
      push({
        status: "removed",
        kind: classification.kind,
        signals: classification.signals,
        older: side(before, diff.segments),
        newer: null,
        values: classification.values,
      });
    } else {
      const after = newer[op.newer]!;
      const diff = wholeSide(after.text);
      const classification = classifyChange(null, { text: after.text, diff });
      push({
        status: "added",
        kind: classification.kind,
        signals: classification.signals,
        older: null,
        newer: side(after, diff.segments),
        values: classification.values,
      });
    }
  }
  return { changes, unchanged, aligned, byKind };
}
