import { LOW_CONFIDENCE_BELOW } from "@workspace/grounding";
import type { AnswerStyle } from "./flow";

/**
 * The per-question half of the decision flow (PRD §8, "Question unsupported
 * by document"): before anything is written, decide whether the document can
 * support an answer at all. The same check runs twice in the pipeline, with
 * the same rule: after retrieval (the chunks that scored above the lexical
 * threshold) and after validation (the citations the validator accepted).
 * No evidence, or evidence the producer is not confident in, means the
 * reader is told the document does not answer this and is handed a question
 * to take to a professional. There is no third outcome; the flow never lets
 * a guess through.
 */

export interface AnswerEvidence {
  /** The reader's question, as typed. */
  question: string;
  /** Chunk ids the answer can stand on. Empty means the document has nothing. */
  chunkIds: readonly string[];
  /** 0–1 when the producer reports one (retrieval score, claim confidence); null when it does not. */
  confidence: number | null;
}

export type NoEvidenceReason = "no-evidence" | "low-confidence";

export type AnswerDecision =
  | { kind: "grounded-answer"; style: AnswerStyle; chunkIds: readonly string[] }
  | {
      kind: "no-evidence";
      reason: NoEvidenceReason;
      /** Copy key; the client's copy table renders it in the reader's language. */
      message: "document-does-not-answer";
      /**
       * A question to take to a lawyer or legal-aid service, in the reader's
       * own words; `frame` is the copy key the client wraps it in ("Ask a
       * lawyer or legal-aid service: … and mention that your document does
       * not cover it"), so no English is baked in here.
       */
      suggestedQuestion: { frame: "ask-a-professional"; question: string };
    };

export interface AnswerOptions {
  /** From the flow's decision; `brief` under a close deadline. */
  answerStyle?: AnswerStyle;
}

/** The reader's question with its whitespace tidied and a question mark added when it has no end punctuation. */
export function tidyQuestion(question: string): string {
  const trimmed = question.replace(/\s+/g, " ").trim();
  if (trimmed === "") return "";
  return /[?.!।]$/.test(trimmed) ? trimmed : `${trimmed}?`;
}

export function decideAnswer(evidence: AnswerEvidence, options: AnswerOptions = {}): AnswerDecision {
  const chunkIds = Array.from(new Set(evidence.chunkIds.filter((id) => id.trim() !== "")));
  const refuse = (reason: NoEvidenceReason): AnswerDecision => ({
    kind: "no-evidence",
    reason,
    message: "document-does-not-answer",
    suggestedQuestion: { frame: "ask-a-professional", question: tidyQuestion(evidence.question) },
  });
  if (chunkIds.length === 0) return refuse("no-evidence");
  if (evidence.confidence !== null && !(evidence.confidence >= LOW_CONFIDENCE_BELOW)) return refuse("low-confidence");
  return { kind: "grounded-answer", style: options.answerStyle ?? "full", chunkIds };
}
