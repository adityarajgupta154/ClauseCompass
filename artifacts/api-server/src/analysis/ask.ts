import {
  LOW_CONFIDENCE_BELOW,
  buildIndex,
  describeLanguageViolation,
  findLanguageViolations,
  retrieve,
  type GroundedClaim,
  type SourceChunk,
} from "@workspace/grounding";
import { decideAnswer, tidyQuestion, type AnswerDecision, type AnswerStyle, type NoEvidenceReason } from "@workspace/rules";
import type { Logger } from "pino";
import { generateClaims, type LlmProvider } from "../llm";
import { MAX_EXCERPT_CHARS } from "./document-map";
import { spanOf, windowAround } from "./verbatim";

/**
 * Ask about this document (PRD section 5 step 5, FR-08, section 8
 * "Question unsupported by the document"): the reader's question, answered
 * from the document's own paragraphs or not at all.
 *
 * Retrieval decides what the model may read: the paragraphs that share the
 * question's words (BM25 with the lay and Hinglish synonym table), a
 * handful at most, and nothing else from the document. The model's part is
 * to say what those paragraphs state on the point asked, one to three
 * sentences each with its quote; the validator keeps only statements it
 * can find word for word in a passage that was sent. The decision flow's
 * answer rule runs twice around that call: after retrieval (no passage, no
 * call) and after validation (nothing verified, or only weakly supported
 * statements, is no answer). Either refusal says so and hands the reader
 * their question back to take to a professional; a guess is never an
 * outcome. Nothing here is kept: the question is not stored, logged or
 * echoed anywhere but in this response.
 */

export type AskStatus = "answered" | "not-in-document" | "model-unavailable";

/**
 * Why there is no answer. `no-evidence` and `low-confidence` are the flow's
 * own reasons; `nothing-verified` is the case between them: passages were
 * read, but no statement about them survived the validator.
 */
export type NoAnswerReason = NoEvidenceReason | "nothing-verified";

export interface Answer {
  status: AskStatus;
  /** Set when `status` is not-in-document. */
  reason: NoAnswerReason | null;
  /** The reader's question tidied, to take to a professional; set when status is not-in-document. */
  suggestedQuestion: string | null;
  style: AnswerStyle;
  /** The answer: one to three verified statements, each quoting a passage. Empty unless answered. */
  claims: GroundedClaim[];
  /** The paragraphs read for the question, document order; the only ones the model saw and the targets of every citation. */
  passages: SourceChunk[];
  /** Model statements not shown: withheld by the validator, below the confidence floor, or failing the language check. */
  withheld: number;
}

export interface AskOptions {
  provider: LlmProvider;
  model: string;
  /** From the flow's decision: `brief` under a close deadline. */
  style?: AnswerStyle;
  log?: Pick<Logger, "info" | "warn">;
  signal?: AbortSignal;
}

/** Longest question accepted, in characters after whitespace is tidied. */
export const MAX_QUESTION_CHARS = 500;
/** Paragraphs read for one question: retrieval's top hits. */
export const MAX_ASK_PASSAGES = 5;
/** Characters those paragraphs may total in the call (the first always fits). */
export const MAX_ASK_CHARS = 10_000;
/** Statements an answer may carry, by style. */
export const CLAIMS_BY_STYLE: Readonly<Record<AnswerStyle, number>> = Object.freeze({ brief: 1, full: 3 });
/** The one category key the answer's claims carry; a question is not a clause rule. */
export const ANSWER_CATEGORY = "answer";

export class QuestionTooLongError extends RangeError {
  constructor(length: number) {
    super(`question is ${length} characters, above the ${MAX_QUESTION_CHARS} cap`);
    this.name = "QuestionTooLongError";
  }
}

/** The task line. Fixed wording; the reader's words travel separately, as quoted data (llm/prompt.ts). */
export const ASK_TASK = [
  "Answer the reader's question from the excerpts and from nothing else: state what the excerpts say on the point asked, in one to three short sentences, each resting on its own quote.",
  "If the excerpts do not answer the question, return an empty claims list; do not fill the gap from general knowledge and do not guess.",
  "Say what the document states; do not say what the reader ought to do.",
].join(" ");

/**
 * The passage the model reads for one hit: the paragraph, or a window of
 * it around the first typed word it contains when the paragraph is very
 * long. A word found only through a synonym is not in the text, so the
 * window then opens at the start.
 */
export function passageOf(chunk: SourceChunk, matchedTerms: readonly string[]): SourceChunk {
  const { text } = chunk;
  if (text.length <= MAX_EXCERPT_CHARS) return chunk;
  const lower = text.toLowerCase();
  const focus = matchedTerms.map((term) => spanOf(lower, term.toLowerCase())).find((span) => span !== null) ?? { start: 0, end: 0 };
  const shown = windowAround(text, { start: 0, end: text.length }, focus, MAX_EXCERPT_CHARS);
  return { ...chunk, text: text.slice(shown.start, shown.end) };
}

/**
 * The paragraphs to read for a question: retrieval's top hits, kept while
 * the character cap allows (the first always fits), then in document order,
 * which is how the model should read them.
 */
export function selectPassages(chunks: readonly SourceChunk[], question: string): SourceChunk[] {
  const hits = retrieve(buildIndex(chunks), question, { limit: MAX_ASK_PASSAGES });
  const kept: Array<{ passage: SourceChunk; position: number }> = [];
  let chars = 0;
  for (const hit of hits) {
    const passage = passageOf(hit.chunk, hit.matchedTerms);
    if (kept.length > 0 && chars + passage.text.length > MAX_ASK_CHARS) continue;
    kept.push({ passage, position: hit.position });
    chars += passage.text.length;
  }
  return kept.sort((a, b) => a.position - b.position).map((item) => item.passage);
}

/**
 * The statements an answer may show: those the flow's rule accepts. The
 * rule is applied to the best-supported statement first - if even that one
 * is below the confidence floor there is no answer - and then to each of
 * the rest, so a confident statement is never shown beside a guess. The
 * language check is the builder's own assertion of the validator's rule.
 */
export function keepConfident(
  question: string,
  claims: readonly GroundedClaim[],
  style: AnswerStyle,
  log: AskOptions["log"],
): { decision: AnswerDecision; claims: GroundedClaim[] } {
  const ranked = [...claims].sort((a, b) => b.confidence - a.confidence);
  const acceptable = ranked.filter((claim) => {
    const violations = findLanguageViolations(claim.text);
    if (violations.length === 0) return true;
    log?.warn({ violations: violations.map(describeLanguageViolation) }, "answer statement failed the language check after validation; withheld");
    return false;
  });
  const best = acceptable[0];
  const decision = decideAnswer(
    {
      question,
      chunkIds: best ? acceptable.flatMap((claim) => claim.source_chunk_ids) : [],
      confidence: best ? best.confidence : null,
    },
    { answerStyle: style },
  );
  if (decision.kind !== "grounded-answer") return { decision, claims: [] };
  return { decision, claims: acceptable.filter((claim) => claim.confidence >= LOW_CONFIDENCE_BELOW) };
}

function refusal(decision: AnswerDecision, reason: NoAnswerReason, style: AnswerStyle, passages: SourceChunk[], withheld: number): Answer {
  const suggestedQuestion = decision.kind === "no-evidence" ? decision.suggestedQuestion.question : null;
  return { status: "not-in-document", reason, suggestedQuestion, style, claims: [], passages, withheld };
}

/**
 * Answers one question about one document. Throws QuestionTooLongError
 * before anything is read for a question over the cap; anything the
 * provider does not report as its own failure propagates.
 */
export async function askDocument(chunks: readonly SourceChunk[], rawQuestion: string, options: AskOptions): Promise<Answer> {
  // The cap is on the reader's words with their whitespace tidied, not on the question mark tidyQuestion may add: a question the client let through at the cap is not refused for it.
  const typed = rawQuestion.replace(/\s+/g, " ").trim();
  if (typed.length > MAX_QUESTION_CHARS) throw new QuestionTooLongError(typed.length);
  const question = tidyQuestion(rawQuestion);
  const style = options.style ?? "full";
  const started = performance.now();
  const passages = question === "" ? [] : selectPassages(chunks, question);

  // First application of the flow's rule: no passage shares a word with the question, so there is nothing to read and no call to make.
  const beforeCall = decideAnswer({ question, chunkIds: passages.map((passage) => passage.id), confidence: null }, { answerStyle: style });
  if (beforeCall.kind === "no-evidence") {
    options.log?.info({ questionChars: question.length, passages: 0, status: "not-in-document", reason: beforeCall.reason, style }, "question not in document");
    return refusal(beforeCall, beforeCall.reason, style, passages, 0);
  }

  const result = await generateClaims(
    { task: ASK_TASK, question, chunks: passages, categories: [ANSWER_CATEGORY], maxClaims: CLAIMS_BY_STYLE[style] },
    options.provider,
    { model: options.model, log: options.log, signal: options.signal },
  );
  const ms = () => Math.round(performance.now() - started);
  if (!result.ok) {
    if (result.reason === "provider-error") {
      options.log?.warn({ questionChars: question.length, passages: passages.length, status: "model-unavailable", ms: ms() }, "question not answered: model unavailable");
      return { status: "model-unavailable", reason: null, suggestedQuestion: null, style, claims: [], passages, withheld: 0 };
    }
    // The reply was unusable twice: the passages were read and nothing about them could be verified.
    const decision = decideAnswer({ question, chunkIds: [], confidence: null }, { answerStyle: style });
    options.log?.info({ questionChars: question.length, passages: passages.length, status: "not-in-document", reason: "nothing-verified", style, ms: ms() }, "question not in document");
    return refusal(decision, "nothing-verified", style, passages, 0);
  }

  // Second application: what survived the validator, and how firmly it stands.
  const { decision, claims } = keepConfident(question, result.claims, style, options.log);
  const withheld = result.withheld + (result.claims.length - claims.length);
  const summary = { questionChars: question.length, passages: passages.length, claims: claims.length, withheld, style, ms: ms() };
  if (decision.kind !== "grounded-answer") {
    const reason: NoAnswerReason = decision.reason === "low-confidence" ? "low-confidence" : "nothing-verified";
    options.log?.info({ ...summary, status: "not-in-document", reason }, "question not in document");
    return refusal(decision, reason, style, passages, withheld);
  }
  options.log?.info({ ...summary, status: "answered" }, "question answered");
  return { status: "answered", reason: null, suggestedQuestion: null, style, claims, passages, withheld };
}
