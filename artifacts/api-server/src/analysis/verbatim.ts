import { MODEL_OUTPUT_LIMITS, type GroundedClaim, type SourceChunk } from "@workspace/grounding";

/**
 * Claims made of the document's own words. The deterministic layer (dates,
 * clause rules) knows *where* something is said; when there is no verified
 * plain-language restatement to show for it, the product shows the sentence
 * itself rather than nothing and rather than a guess. Such a claim is
 * grounded by construction: its quote is a substring of the cited chunk,
 * and its confidence is 1 because the statement is the wording.
 */

/** A half-open character range within a chunk's text. */
export interface Span {
  start: number;
  end: number;
}

const ELLIPSIS = "\u2026";

/**
 * A sentence ends at . ! ? or danda, optionally followed by closing quotes
 * or brackets, then whitespace and a new token. The abbreviations legal
 * text is full of ("Rs. 18,000", "Mr. Kulkarni", "No. 402", "i.e.") and a
 * single-letter initial ("A. B. Sharma") do not end one.
 */
const TERMINATOR = /[.!?\u0964]["\u201d')\]]*\s+(?=\S)/gu;
const ABBREVIATION =
  /(?:^|[\s(])(?:Mr|Mrs|Ms|Dr|Rs|Re|No|Nos|Sr|Jr|St|Pvt|Ltd|Co|Inc|vs|etc|viz|Shri|Smt|Prof|Hon|Adv|M\/s|a\.m|p\.m|i\.e|e\.g|[A-Z])\.["\u201d')\]]*\s+$/u;

/** The sentence of `text` that contains offset `at`. */
export function sentenceAt(text: string, at: number): Span {
  let start = 0;
  TERMINATOR.lastIndex = 0;
  for (let match = TERMINATOR.exec(text); match !== null; match = TERMINATOR.exec(text)) {
    const boundary = match.index + match[0].length;
    if (ABBREVIATION.test(text.slice(Math.max(0, match.index - 8), boundary))) continue;
    if (boundary <= at) start = boundary;
    else return { start, end: trimEnd(text, match.index + match[0].trimEnd().length) };
  }
  return { start, end: trimEnd(text, text.length) };
}

function trimEnd(text: string, end: number): number {
  while (end > 0 && /\s/.test(text[end - 1]!)) end -= 1;
  return end;
}

/**
 * At most `maxChars` of `text` inside `bounds`, always containing `focus`.
 * When the sentence is longer than the cap, the window is centred on the
 * focus and widened to whole words. The result is still a verbatim
 * substring; whether it is marked as cut is the caller's choice.
 */
export function windowAround(text: string, bounds: Span, focus: Span, maxChars: number): Span {
  if (bounds.end - bounds.start <= maxChars) return bounds;
  const focusLength = focus.end - focus.start;
  const room = Math.max(0, maxChars - focusLength);
  let start = Math.max(bounds.start, focus.start - Math.floor(room / 2));
  let end = Math.min(bounds.end, start + maxChars);
  start = Math.max(bounds.start, end - maxChars);
  // Widen to word boundaries by shrinking inward: never cut a word in half.
  while (start > bounds.start && start < focus.start && /\S/.test(text[start - 1]!)) start += 1;
  while (end < bounds.end && end > focus.end && /\S/.test(text[end]!)) end -= 1;
  return { start: Math.min(start, focus.start), end: Math.max(end, focus.end) };
}

export interface VerbatimOptions {
  /** What goes into `quote`: the exact match (a date as written) or the sentence around it. */
  quote: "match" | "sentence";
}

/**
 * A GroundedClaim whose text is the sentence around `match`, clipped for
 * display when the sentence is longer than the contract's claim text
 * length (a cut end is marked with an ellipsis), and whose quote is either
 * the match itself or the sentence, never longer than the contract allows.
 */
export function verbatimClaim(
  chunk: SourceChunk,
  match: Span,
  category: string,
  options: VerbatimOptions,
): GroundedClaim {
  const { text } = chunk;
  if (match.start < 0 || match.end > text.length || match.start >= match.end) {
    throw new RangeError(`verbatimClaim: match ${match.start}-${match.end} outside chunk ${chunk.id}`);
  }
  const sentence = sentenceAt(text, match.start);
  const shown = windowAround(text, sentence, match, MODEL_OUTPUT_LIMITS.claimTextChars - 2);
  const display =
    (shown.start > sentence.start ? ELLIPSIS : "") +
    text.slice(shown.start, shown.end) +
    (shown.end < sentence.end ? ELLIPSIS : "");
  const quoted =
    options.quote === "match" ? match : windowAround(text, sentence, match, MODEL_OUTPUT_LIMITS.quoteChars);
  return {
    text: display,
    quote: text.slice(quoted.start, quoted.end),
    source_chunk_ids: [chunk.id],
    location: chunk.location,
    confidence: 1,
    category,
  };
}

/** Where `needle` first occurs in `text`, as a span; null when it does not. */
export function spanOf(text: string, needle: string): Span | null {
  const start = text.indexOf(needle);
  return start === -1 ? null : { start, end: start + needle.length };
}
