import type { ZodIssue } from "zod";
import type { GroundedClaim, SourceChunk } from "./claim";
import { describeLanguageViolation, findLanguageViolations } from "./language";
import { MODEL_OUTPUT_LIMITS, type ModelClaim, type ModelOutputOptions, modelOutputSchema } from "./model-output";
import { normalizeForMatch } from "./normalize";

export { normalizeForMatch } from "./normalize";

/**
 * The output validator (PRD section 7.2: "validator confirms every citation's
 * chunk ID actually exists and supports the claim"). It sits between the
 * model and everything else: a claim reaches a response, a log line or the
 * client only as a GroundedClaim produced here.
 *
 * Two levels of failure, because they call for different repairs:
 *
 * - The output as a whole is unusable (not JSON, or not the schema). Nothing
 *   is salvaged; the caller asks the model again once, with the issues.
 * - A single claim fails its evidence check (cites an id that was never sent,
 *   or its quote is not in the cited chunk). That claim is rejected with a
 *   reason the caller can feed back; the other claims stand.
 *
 * The check is deliberately mechanical. "Supports the claim" is proven by
 * the quote: the model must copy the supporting words verbatim, and they must
 * be found (after whitespace, case and quote-mark normalisation) in a chunk
 * the claim cites. Nothing here judges whether the plain-language text is a
 * fair rewrite; that is what the quote shown next to it is for.
 *
 * One thing about the text itself is checked: its register. A statement
 * that gives a verdict, predicts an outcome, decides eligibility, advises
 * a decision or judges fairness (the Responsible Language table in
 * language.ts) is rejected with the offending words and what to say
 * instead, so the retry can fix it and nothing conclusory reaches a screen.
 */

export type RejectionReason =
  | "unknown-chunk"
  | "quote-too-short"
  | "quote-not-found"
  | "instructions-echoed"
  | "conclusory-language"
  | "off-register";

/**
 * A caller's own test of the claim text beyond the shared table - the review
 * view requires a prompt to ask or check something. Returns the retry
 * instruction when the text fails, null when it passes.
 */
export type RegisterCheck = (text: string) => string | null;

export interface ValidateOptions extends ModelOutputOptions {
  register?: RegisterCheck;
  /**
   * What the model was told besides the task and the excerpts: the system
   * policy and the fixed lines of the user message. A claim that repeats a
   * run of `INSTRUCTION_ECHO_WORDS` words from any of them is reciting its
   * instructions, not the document (PRD §9, "reveal the system prompt"),
   * and is withheld. The reader's own question is not an instruction and
   * must not be passed here.
   */
  instructions?: readonly string[];
}

/**
 * What counts as reciting the instructions. Eight consecutive words in the
 * policy's order do not occur by accident in a sentence about a lease
 * (`INSTRUCTION_ECHO_WORDS`). A recital with words changed or filler added
 * every so often has no such run, so a window of `INSTRUCTION_ECHO_WINDOW`
 * words is also compared in order against every nearby span of the
 * instructions (one and a half times the window), and counts when
 * `INSTRUCTION_ECHO_SHARE` of its words are found in that order. Both are
 * looked for inside each claim and across the reply's claims read one after
 * another, so the prompt cannot be handed over in pieces. A claim shorter
 * than a run counts when the whole of it is instruction text, and an
 * instruction too short to have words to speak of (a tool name) counts
 * wherever it appears. A thorough paraphrase is beyond a mechanical check,
 * and nothing in the instructions is secret.
 */
export const INSTRUCTION_ECHO_WORDS = 8;
export const INSTRUCTION_ECHO_WINDOW = 16;
export const INSTRUCTION_ECHO_SHARE = 0.7;
const INSTRUCTION_SPAN_SLACK = 1.5;
const INSTRUCTION_WINDOW_STEP = 4;
const INSTRUCTION_ECHO_MIN_WORDS = 3;

export interface RejectedClaim {
  /** Position in the model's claims array, 0-based. */
  index: number;
  reason: RejectionReason;
  /** One sentence for the retry prompt and the log. Names ids and counts, never document text. */
  detail: string;
}

export type OutputFailure = "not-json" | "schema";

export type ValidationResult =
  | { ok: true; claims: GroundedClaim[]; rejected: RejectedClaim[] }
  | { ok: false; failure: OutputFailure; issues: string[] };

/** How many schema issues are worth relaying; past this the output is simply wrong. */
const MAX_ISSUES = 8;

/** Tokens that carry a letter or digit; ". . ." or "— — —" is not three words of evidence. */
function wordCount(text: string): number {
  return text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

function describeIssue(issue: ZodIssue): string {
  const path = issue.path.length === 0 ? "output" : issue.path.join(".");
  return `${path}: ${issue.message}`;
}

function parseJson(output: unknown): { value: unknown } | { error: true } {
  if (typeof output !== "string") return { value: output };
  try {
    return { value: JSON.parse(output) };
  } catch {
    // The SyntaxError's text can echo the output itself; the model is told
    // what went wrong, not what it wrote.
    return { error: true };
  }
}

interface Sent {
  byId: Map<string, SourceChunk>;
  normalized: Map<string, string>;
}

function indexSent(chunks: readonly SourceChunk[]): Sent {
  const byId = new Map<string, SourceChunk>();
  const normalized = new Map<string, string>();
  for (const chunk of chunks) {
    if (byId.has(chunk.id)) throw new RangeError(`duplicate chunk id ${JSON.stringify(chunk.id)} in the chunks sent`);
    byId.set(chunk.id, chunk);
    normalized.set(chunk.id, normalizeForMatch(chunk.text));
  }
  return { byId, normalized };
}

interface Instructions {
  /** Every run of INSTRUCTION_ECHO_WORDS words, normalised and space-joined. */
  runs: Set<string>;
  /** The instructions' words in order, one text after another, a newline token between texts so no span crosses from one to the next. */
  tokens: string[];
  /** Each instruction's words space-joined and space-padded, one per line, for claims shorter than one run. */
  joined: string;
  /** Instructions of fewer than INSTRUCTION_ECHO_MIN_WORDS words (a tool name), matched literally, case aside. */
  names: string[];
}

/** Words as compared for a recital: normalised like a quote, punctuation dropped, apostrophes kept. */
function wordsOf(text: string): string[] {
  return normalizeForMatch(text)
    .split(/[^\p{L}\p{N}']+/u)
    .filter((word) => word !== "");
}

function windowsOf(words: readonly string[], size: number): string[] {
  const out: string[] = [];
  for (let start = 0; start + size <= words.length; start += 1) out.push(words.slice(start, start + size).join(" "));
  return out;
}

function indexInstructions(texts: readonly string[] | undefined): Instructions | null {
  if (!texts || texts.length === 0) return null;
  const runs = new Set<string>();
  const tokens: string[] = [];
  const joined: string[] = [];
  const names: string[] = [];
  for (const text of texts) {
    const words = wordsOf(text);
    if (words.length < INSTRUCTION_ECHO_MIN_WORDS) {
      if (text.trim() !== "") names.push(text.trim().toLowerCase());
      continue;
    }
    joined.push(` ${words.join(" ")} `);
    if (tokens.length > 0) tokens.push("\n");
    tokens.push(...words);
    for (const run of windowsOf(words, INSTRUCTION_ECHO_WORDS)) runs.add(run);
  }
  return { runs, tokens, joined: joined.join("\n"), names };
}

/** Length of the longest common subsequence of two word lists: the words of `a` that appear in `b` in the same order, gaps allowed. */
function inOrderShared(a: readonly string[], b: readonly string[]): number {
  let previous = new Array<number>(b.length + 1).fill(0);
  let current = new Array<number>(b.length + 1).fill(0);
  for (const word of a) {
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = word === b[j - 1] ? previous[j - 1]! + 1 : Math.max(previous[j]!, current[j - 1]!);
    }
    [previous, current] = [current, previous];
  }
  return previous[b.length]!;
}

/**
 * Whether the words of one window are mostly the instructions' words in the
 * instructions' order, within a span not much longer than the window. Only
 * spans opening on one of the window's words need trying: a span opening
 * elsewhere shares nothing the next one does not.
 */
function nearlyRecites(window: readonly string[], instructions: Instructions): boolean {
  const needed = Math.ceil(window.length * INSTRUCTION_ECHO_SHARE);
  const span = Math.ceil(window.length * INSTRUCTION_SPAN_SLACK);
  const wanted = new Set(window);
  const { tokens } = instructions;
  for (let start = 0; start < tokens.length; start += 1) {
    if (!wanted.has(tokens[start]!)) continue;
    const end = Math.min(tokens.length, start + span);
    const sliceEnd = tokens.indexOf("\n", start) === -1 ? end : Math.min(end, tokens.indexOf("\n", start));
    if (inOrderShared(window, tokens.slice(start, sliceEnd)) >= needed) return true;
  }
  return false;
}

/** The [start, end) windows a sequence is looked at through: whole when short, else sliding, the last one flush with the end. */
function windowBounds(length: number): [number, number][] {
  if (length <= INSTRUCTION_ECHO_WINDOW) return length === 0 ? [] : [[0, length]];
  const bounds: [number, number][] = [];
  for (let start = 0; start + INSTRUCTION_ECHO_WINDOW < length; start += INSTRUCTION_WINDOW_STEP) bounds.push([start, start + INSTRUCTION_ECHO_WINDOW]);
  bounds.push([length - INSTRUCTION_ECHO_WINDOW, length]);
  return bounds;
}

/** Whether one claim, on its own, recites the instructions. */
function echoesInstructions(text: string, words: readonly string[], instructions: Instructions): boolean {
  const lowered = text.toLowerCase();
  if (instructions.names.some((name) => lowered.includes(name))) return true;
  if (words.length < INSTRUCTION_ECHO_MIN_WORDS) return false;
  // Whole words only: " data from the " must not match inside " the data from them ".
  if (words.length < INSTRUCTION_ECHO_WORDS) return instructions.joined.includes(` ${words.join(" ")} `);
  if (windowsOf(words, INSTRUCTION_ECHO_WORDS).some((run) => instructions.runs.has(run))) return true;
  return windowBounds(words.length).some(([start, end]) => nearlyRecites(words.slice(start, end), instructions));
}

/**
 * The claims that, read one after another, recite the instructions across
 * their boundaries: a policy handed over four words at a time is still
 * handed over. A run of the instructions' words through the reply flags
 * every claim with a word in it; the words either side of each boundary
 * (a window's worth) are also read as one, and a near recital there flags
 * both neighbours. A run inside a single claim is that claim's own affair.
 */
function echoedAcrossClaims(claimWords: readonly (readonly string[])[], instructions: Instructions): Set<number> {
  const tokens: { word: string; claim: number }[] = [];
  claimWords.forEach((words, claim) => words.forEach((word) => tokens.push({ word, claim })));
  const flagged = new Set<number>();
  for (let start = 0; start + INSTRUCTION_ECHO_WORDS <= tokens.length; start += 1) {
    const end = start + INSTRUCTION_ECHO_WORDS;
    if (tokens[start]!.claim === tokens[end - 1]!.claim) continue;
    if (instructions.runs.has(tokens.slice(start, end).map((token) => token.word).join(" "))) {
      for (const token of tokens.slice(start, end)) flagged.add(token.claim);
    }
  }
  const half = INSTRUCTION_ECHO_WINDOW / 2;
  for (let claim = 0; claim + 1 < claimWords.length; claim += 1) {
    const window = [...claimWords[claim]!.slice(-half), ...claimWords[claim + 1]!.slice(0, half)];
    if (window.length < INSTRUCTION_ECHO_MIN_WORDS || !nearlyRecites(window, instructions)) continue;
    flagged.add(claim);
    flagged.add(claim + 1);
  }
  return flagged;
}

interface EchoCheck {
  instructions: Instructions;
  /** Indexes of the claims that recite a run together (see `echoedAcrossClaims`). */
  acrossClaims: ReadonlySet<number>;
}

function checkClaim(
  claim: ModelClaim,
  index: number,
  sent: Sent,
  echo: EchoCheck | null,
  register?: RegisterCheck,
): GroundedClaim | RejectedClaim {
  const label = `Claim ${index + 1}`;
  const ids = Array.from(new Set(claim.source_chunk_ids));

  const unknown = ids.filter((id) => !sent.byId.has(id));
  if (unknown.length > 0) {
    const allowed = Array.from(sent.byId.keys()).join(", ");
    return {
      index,
      reason: "unknown-chunk",
      detail: `${label} cites ${unknown.map((id) => JSON.stringify(id)).join(", ")}, not among the excerpts (allowed ids: ${allowed}).`,
    };
  }

  if (wordCount(claim.quote) < MODEL_OUTPUT_LIMITS.quoteMinWords) {
    return {
      index,
      reason: "quote-too-short",
      detail: `${label}'s quote has fewer than ${MODEL_OUTPUT_LIMITS.quoteMinWords} words; copy a longer verbatim span from the cited excerpt.`,
    };
  }

  const quote = normalizeForMatch(claim.quote);
  // The citations that carry the quote come first: the claim's location is the first one,
  // and callers that must tie a claim to a particular excerpt read the same slot.
  const supporting = ids.filter((id) => sent.normalized.get(id)!.includes(quote));
  if (supporting.length === 0) {
    const elsewhere = Array.from(sent.normalized.entries()).find(([, text]) => text.includes(quote))?.[0];
    const hint = elsewhere
      ? ` The words appear in ${JSON.stringify(elsewhere)}; cite the excerpt the quote comes from.`
      : " Copy the supporting words exactly as written in a cited excerpt, or drop the claim.";
    return {
      index,
      reason: "quote-not-found",
      detail: `${label}'s quote was not found verbatim in its cited excerpt(s) ${ids.map((id) => JSON.stringify(id)).join(", ")}.${hint}`,
    };
  }

  if (echo !== null && (echo.acrossClaims.has(index) || echoesInstructions(claim.text, wordsOf(claim.text), echo.instructions))) {
    // The detail says what happened, not what was repeated: the feedback goes back to the model, the reason to the log.
    return {
      index,
      reason: "instructions-echoed",
      detail: `${label} repeats the instructions instead of restating the excerpts; say only what the cited excerpt says, or drop it.`,
    };
  }

  const violations = findLanguageViolations(claim.text);
  if (violations.length > 0) {
    // The phrase reported is the model's own words in the lexicon's shape, never a passage of the document.
    return {
      index,
      reason: "conclusory-language",
      detail: `${label}'s wording: ${violations.map(describeLanguageViolation).join(" Also, ")} Keep the claim if it can be said that way, otherwise drop it.`,
    };
  }

  const issue = register?.(claim.text) ?? null;
  if (issue !== null) {
    return { index, reason: "off-register", detail: `${label}: ${issue}` };
  }

  const ordered = [...supporting, ...ids.filter((id) => !supporting.includes(id))];
  return {
    text: claim.text,
    quote: claim.quote,
    source_chunk_ids: ordered,
    location: sent.byId.get(ordered[0]!)!.location,
    confidence: claim.confidence,
    category: claim.category,
  };
}

/**
 * Checks one model response against the chunks that were sent for it.
 * `output` may be the parsed JSON value or the raw text of the response.
 */
export function validateModelOutput(
  output: unknown,
  sentChunks: readonly SourceChunk[],
  options: ValidateOptions,
): ValidationResult {
  const sent = indexSent(sentChunks);

  const parsed = parseJson(output);
  if ("error" in parsed) {
    return { ok: false, failure: "not-json", issues: ["The output was not valid JSON."] };
  }

  const result = modelOutputSchema(options).safeParse(parsed.value);
  if (!result.success) {
    const issues = result.error.issues.slice(0, MAX_ISSUES).map(describeIssue);
    if (result.error.issues.length > MAX_ISSUES) issues.push(`…and ${result.error.issues.length - MAX_ISSUES} more.`);
    return { ok: false, failure: "schema", issues };
  }

  const instructions = indexInstructions(options.instructions);
  const echo: EchoCheck | null =
    instructions === null
      ? null
      : { instructions, acrossClaims: echoedAcrossClaims(result.data.claims.map((claim) => wordsOf(claim.text)), instructions) };
  const claims: GroundedClaim[] = [];
  const rejected: RejectedClaim[] = [];
  result.data.claims.forEach((claim, index) => {
    const outcome = checkClaim(claim, index, sent, echo, options.register);
    if ("reason" in outcome) rejected.push(outcome);
    else claims.push(outcome);
  });
  return { ok: true, claims, rejected };
}
