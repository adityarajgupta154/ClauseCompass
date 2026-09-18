import type { SourceChunk } from "@workspace/grounding";
import { evaluateRules } from "@workspace/rules";
import type { ExtractedDocument } from "../extraction";
import { toSourceChunks } from "./chunks";
import { buildTimeline, type TimelineItem } from "./dates";
import { buildDocumentMap, type BuildMapOptions, type DocumentMap } from "./document-map";
import { buildReviewPrompts, type BuildReviewPromptsOptions, type ReviewPrompts } from "./review-prompts";

export {
  ANSWER_CATEGORY,
  ASK_TASK,
  askDocument,
  CLAIMS_BY_STYLE,
  keepConfident,
  MAX_ASK_CHARS,
  MAX_ASK_PASSAGES,
  MAX_QUESTION_CHARS,
  passageOf,
  QuestionTooLongError,
  selectPassages,
  type Answer,
  type AskOptions,
  type AskStatus,
  type NoAnswerReason,
} from "./ask";
export { chunkId, toSourceChunks } from "./chunks";
export {
  AlignmentTooLargeError,
  CHANGE_KINDS,
  CHANGE_STATUSES,
  compareDocuments,
  MAX_ALIGN_CELLS,
  type Change,
  type ChangeKind,
  type ChangeSide,
  type ChangeStatus,
  type Comparison,
  type DiffSegment,
} from "./compare";
export { buildTimeline, findDates, TIMELINE_CATEGORY, type DateAmbiguity, type DateMention, type TimelineItem } from "./dates";
export {
  buildDocumentMap,
  capEvidence,
  excerptOf,
  FIELD_SPECS,
  MAP_FIELD_IDS,
  MAX_EXCERPT_CHARS,
  MAX_FIELD_CHARS,
  MAX_FIELD_CHUNKS,
  selectEvidence,
  type BuildMapOptions,
  type DocumentMap,
  type Evidence,
  type MapField,
  type MapFieldId,
  type MapFieldStatus,
  type WordingOnlyReason,
} from "./document-map";
export { findPartyChunks, MAX_PARTY_CHUNKS, PARTIES_CATEGORY, type PartyMention } from "./parties";
export {
  absentPrimaryRules,
  buildReviewPrompts,
  GENERIC_PROMPT,
  MAX_CALL_CHARS,
  MAX_CALL_CHUNKS,
  MAX_RULES_PER_CALL,
  PLACES_SENT_PER_RULE,
  placeClaims,
  selectExcerpts,
  taskFor,
  type BuildReviewPromptsOptions,
  type PromptSource,
  type ReviewPrompt,
  type ReviewPromptAbsence,
  type ReviewPrompts,
  type TemplateReason,
} from "./review-prompts";
export { sentenceAt, spanOf, verbatimClaim, windowAround, type Span } from "./verbatim";

export interface DocumentAnalysis {
  chunks: SourceChunk[];
  map: DocumentMap;
  timeline: { items: TimelineItem[] };
}

/**
 * Everything the analysis views need for one extracted document: its
 * chunks (the citation targets), the document map and the timeline. The
 * clause rules run once and feed both the map's evidence and the
 * timeline's topics.
 */
export async function analyzeDocument(
  document: ExtractedDocument,
  options: Omit<BuildMapOptions, "hits">,
): Promise<DocumentAnalysis> {
  const chunks = toSourceChunks(document);
  const hits = evaluateRules(chunks, { stage: options.stage, documentType: options.documentType });
  const timeline = buildTimeline(chunks, hits);
  const map = await buildDocumentMap(chunks, { ...options, hits });
  return { chunks, map, timeline: { items: timeline } };
}

export interface ReviewPromptsAnalysis {
  chunks: SourceChunk[];
  review: ReviewPrompts;
}

/**
 * The Review Prompts view for one extracted document: its chunks (the
 * citation targets) and one prompt per clause rule that fired, phrased by
 * the model where a verified phrasing exists and by the registry template
 * otherwise. Runs the clause rules once, like analyzeDocument, but not the
 * map: each view is one request today.
 */
export async function analyzeReviewPrompts(
  document: ExtractedDocument,
  options: Omit<BuildReviewPromptsOptions, "hits">,
): Promise<ReviewPromptsAnalysis> {
  const chunks = toSourceChunks(document);
  const hits = evaluateRules(chunks, { stage: options.stage, documentType: options.documentType });
  const review = await buildReviewPrompts(chunks, { ...options, hits });
  return { chunks, review };
}
