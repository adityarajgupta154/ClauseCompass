import { normalizeForMatch } from "@workspace/grounding";
import { findDates } from "../dates";
import type { Span } from "../verbatim";
import type { SideDiff } from "./diff";

/**
 * What kind of change a paragraph edit is (PRD FR-07): money, time, duty,
 * remedy, or wording when none of those is touched. Deterministic and
 * lexical: each kind has detectors, a detector only counts when what it
 * matched overlaps the changed words (so "notice" in an untouched part of
 * the sentence says nothing about an edit elsewhere), the kinds are scored
 * by weight and the strongest wins. Specific things — an amount, a period, a
 * date, a remedy word — weigh more than nouns that merely belong to a
 * topic, and a tie is broken in a fixed order.
 */

export const CHANGE_KINDS = ["money", "time", "duty", "remedy", "wording"] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

/** Ties resolve towards the earlier kind. */
const PRECEDENCE: readonly ChangeKind[] = ["money", "time", "remedy", "duty", "wording"];

export interface Classification {
  kind: ChangeKind;
  /** Every kind with a signal in the change, strongest first; `kind` is the first, or "wording" when there is none. */
  signals: ChangeKind[];
  /** The words of the leading kind found in each side's changed wording, verbatim and in order. */
  values: { older: string[]; newer: string[] };
}

export interface ChangedSide {
  text: string;
  changedSpans: Span[];
}

interface Detection {
  kind: ChangeKind;
  weight: number;
  span: Span;
  /** The matched words, normalised, so the same words count once per side. */
  text: string;
}

/** How many of the leading kind's words are reported per side. */
export const MAX_VALUES = 4;

const NUMBER_WORDS =
  "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|forty-five|fifty|sixty|seventy|eighty|ninety|hundred|thousand|lakh|lakhs|crore|crores)";
const DIGITS = "\\d[\\d,]*(?:\\.\\d+)?";

interface Detector {
  kind: ChangeKind;
  weight: number;
  pattern: RegExp;
}

/** Order matters only for `values`, which lists the leading kind's matches in text order regardless. */
const DETECTORS: readonly Detector[] = [
  // Money: an amount, or an amount written in words after "Rupees".
  { kind: "money", weight: 3, pattern: new RegExp(`(?:rs\\.?|inr|₹)\\s*${DIGITS}(?:\\s*\\/-)?|${DIGITS}\\s*\\/-`, "giu") },
  { kind: "money", weight: 3, pattern: new RegExp(`\\brupees\\s+(?:${NUMBER_WORDS}\\s*)+(?:and\\s+)?(?:only)?`, "giu") },
  { kind: "money", weight: 3, pattern: new RegExp(`${DIGITS}\\s*(?:%|per\\s*cent|percent)`, "giu") },
  {
    kind: "money",
    weight: 1,
    pattern:
      /\b(?:fees?|charges?|deposit|rent|licence fee|payments?|payable|refund(?:able|ed)?|interest|salary|wages?|bonus|stipend|price|costs?|expenses?|tax(?:es)?|amounts?|instal?lments?|invoices?|commission|reimburse(?:ment|d)?)\b/giu,
  },
  // Time: a period, a date, or a deadline word.
  {
    kind: "time",
    weight: 3,
    pattern: new RegExp(
      `\\b(?:${DIGITS}|${NUMBER_WORDS}(?:[- ]${NUMBER_WORDS})?)\\s*(?:\\(\\s*(?:\\d+|${NUMBER_WORDS})\\s*\\)\\s*)?-?\\s*(?:calendar\\s+|working\\s+|business\\s+)?(?:days?|weeks?|months?|years?|hours?)(?:['’]s?)?`,
      "giu",
    ),
  },
  {
    kind: "time",
    weight: 1,
    pattern:
      /\b(?:within|before|until|deadline|expir(?:y|es|ed|ation)|renew(?:al|ed|s)?|extension|extend(?:ed)?|immediately|forthwith|promptly|per annum|annually|monthly|quarterly|weekly|daily|notice period|lock-in)\b/giu,
  },
  // Remedy: what follows a breach or default.
  {
    kind: "remedy",
    weight: 3,
    pattern:
      /\b(?:terminat(?:e|es|ed|ion)|forfeit(?:ure|ed|s)?|deduct(?:ed|ion|ions)?|compensat(?:e|ion)|damages|liquidated|penalt(?:y|ies)|penal|liab(?:le|ility)|indemnif(?:y|ied|ication)|indemnity|remed(?:y|ies|ied)|breach(?:es)?|default|cure|injunct(?:ion|ive)|arbitrat(?:ion|or)|courts?|jurisdiction|disputes?|litigation|proceedings|recover(?:y|ed)?|lien|withh(?:o|e)ld|evict(?:ion|ed)?|lock-?out|suspen(?:d|sion)|cancel(?:lation|led)?|set[- ]off|specific performance|legal action)\b/giu,
  },
  // Duty: who must, must not or may; consent and permission; a bare negation.
  {
    kind: "duty",
    weight: 2,
    pattern:
      /\b(?:shall not|must not|may not|will not|cannot|is not (?:permitted|allowed|entitled)|prohibited|consent|approval|permission|permitted|obligat(?:ion|ions|ed)|responsib(?:le|ility)|undertakes?|compl(?:y|iance)|sole discretion|at (?:his|her|its|their) own cost)\b/giu,
  },
  { kind: "duty", weight: 1, pattern: /\b(?:shall|must|may|will|should|entitled|required)\b/giu },
];

/** Parties whose swap in a changed sentence moves a duty from one side to the other. */
const PARTY_TERMS =
  /\b(?:licensor|licensee|landlord|tenant|lessor|lessee|employer|employee|company|candidate|disclosing party|receiving party|client|consultant|contractor|vendor|customer|either party|both parties)\b/giu;

function overlaps(span: Span, spans: readonly Span[]): boolean {
  return spans.some((other) => span.start < other.end && other.start < span.end);
}

/** A detection nested inside a longer one of the same kind ("shall" inside "shall not") is dropped, and the same words count once. */
function prune(found: Detection[]): Detection[] {
  const sorted = [...found].sort((x, y) => x.span.start - y.span.start || y.span.end - x.span.end);
  const outermost = sorted.filter(
    (detection) =>
      !sorted.some(
        (other) =>
          other !== detection &&
          other.kind === detection.kind &&
          other.span.start <= detection.span.start &&
          detection.span.end <= other.span.end &&
          (other.span.start !== detection.span.start || other.span.end !== detection.span.end),
      ),
  );
  const seen = new Set<string>();
  return outermost.filter((detection) => {
    const key = `${detection.kind}:${detection.weight}:${detection.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function detect(side: ChangedSide): Detection[] {
  const found: Detection[] = [];
  for (const detector of DETECTORS) {
    detector.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = detector.pattern.exec(side.text)) !== null) {
      if (match[0].length === 0) {
        detector.pattern.lastIndex += 1;
        continue;
      }
      const span = { start: match.index, end: match.index + match[0].length };
      if (overlaps(span, side.changedSpans)) {
        found.push({ kind: detector.kind, weight: detector.weight, span, text: normalizeForMatch(match[0]) });
      }
    }
  }
  for (const mention of findDates(side.text)) {
    if (overlaps(mention.span, side.changedSpans)) {
      found.push({ kind: "time", weight: 3, span: mention.span, text: normalizeForMatch(mention.asWritten) });
    }
  }
  return prune(found);
}

function partyTerms(side: ChangedSide): Set<string> {
  const terms = new Set<string>();
  PARTY_TERMS.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PARTY_TERMS.exec(side.text)) !== null) {
    const span = { start: match.index, end: match.index + match[0].length };
    if (overlaps(span, side.changedSpans)) terms.add(match[0].toLowerCase());
  }
  return terms;
}

/** The matched words of one kind, verbatim, in text order, without repeats and without one match nested in another. */
function valuesOf(side: ChangedSide, detections: Detection[], kind: ChangeKind): string[] {
  const spans = detections
    .filter((detection) => detection.kind === kind)
    .map((detection) => detection.span)
    .sort((x, y) => x.start - y.start || y.end - x.end);
  const values: string[] = [];
  let reach = -1;
  for (const span of spans) {
    if (span.start < reach) continue;
    reach = span.end;
    const value = side.text.slice(span.start, span.end).trim();
    if (!values.includes(value)) values.push(value);
    if (values.length === MAX_VALUES) break;
  }
  return values;
}

function fromDiff(text: string, diff: SideDiff): ChangedSide {
  return { text, changedSpans: diff.changedSpans };
}

/**
 * Classifies one change from the changed wording on each side. A pair passes
 * both sides; an added or removed paragraph passes one, with its whole text
 * as the changed span.
 */
export function classifyChange(
  older: { text: string; diff: SideDiff } | null,
  newer: { text: string; diff: SideDiff } | null,
): Classification {
  const olderSide = older ? fromDiff(older.text, older.diff) : null;
  const newerSide = newer ? fromDiff(newer.text, newer.diff) : null;
  const olderFound = olderSide ? detect(olderSide) : [];
  const newerFound = newerSide ? detect(newerSide) : [];

  const weights = new Map<ChangeKind, number>();
  for (const detection of [...olderFound, ...newerFound]) {
    weights.set(detection.kind, (weights.get(detection.kind) ?? 0) + detection.weight);
  }

  // A party named on one side of the change and a different party on the other: the duty changed hands.
  let swappedParties: { older: string[]; newer: string[] } | null = null;
  if (olderSide && newerSide) {
    const before = partyTerms(olderSide);
    const after = partyTerms(newerSide);
    const gone = [...before].filter((term) => !after.has(term));
    const came = [...after].filter((term) => !before.has(term));
    if (gone.length > 0 && came.length > 0) {
      weights.set("duty", (weights.get("duty") ?? 0) + 3);
      swappedParties = { older: gone, newer: came };
    }
  }

  const signals = [...weights.entries()]
    .filter(([, weight]) => weight > 0)
    .sort(([kindA, a], [kindB, b]) => b - a || PRECEDENCE.indexOf(kindA) - PRECEDENCE.indexOf(kindB))
    .map(([kind]) => kind);
  const kind = signals[0] ?? "wording";

  const values = {
    older: olderSide ? valuesOf(olderSide, olderFound, kind) : [],
    newer: newerSide ? valuesOf(newerSide, newerFound, kind) : [],
  };
  if (kind === "duty" && swappedParties) {
    values.older = [...new Set([...swappedParties.older, ...values.older])].slice(0, MAX_VALUES);
    values.newer = [...new Set([...swappedParties.newer, ...values.newer])].slice(0, MAX_VALUES);
  }
  return { kind, signals, values };
}
