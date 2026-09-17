/**
 * @workspace/rules — the typed, versioned clause-rule registry (PRD §7.1 /
 * §8), the pure engine that runs it, and the Context Decision Flow state
 * machine (PRD §8) that decides what the product does next: which clause
 * families lead at a stage, when a deadline makes things urgent, when a
 * safety cue must stop document analysis, and when a question has no
 * evidence behind it. This is deterministic code: no I/O, no model calls,
 * no network, no clock of its own.
 */

export { DOCUMENT_TYPES, STAGE_IDS, isDocumentTypeId, isStageId } from "./contract";
export type { DocumentTypeId, StageId } from "./contract";
export {
  RELEVANCE_LEVELS,
  RULE_FAMILY_IDS,
  clauseRuleSchema,
  detectionSchema,
  documentTypeIdSchema,
  relevanceSchema,
  ruleFamilyIdSchema,
  ruleCaptureNames,
  ruleFamilySchema,
  ruleRegistrySchema,
  stageIdSchema,
} from "./schema";
export type { ClauseRule, Detection, Relevance, RuleFamily, RuleFamilyId, RuleRegistry } from "./schema";
export { RULE_FAMILIES, RULE_REGISTRY } from "./registry";
export {
  compileDetection,
  compilePattern,
  evaluateRules,
  matchDetection,
  matchRule,
  rulesForStage,
  summarizeFamilies,
} from "./engine";
export type {
  CompiledDetection,
  EvaluateOptions,
  FamilySummary,
  HitRelevance,
  RuleChunk,
  RuleHit,
  RuleMatch,
  StageRule,
} from "./engine";
export { describeClause, detectClauseLabel, isHeading } from "./clause-label";
export type { ClauseLabel } from "./clause-label";
export { renderTemplate, templatePlaceholders } from "./template";

export { daysBetween, isIsoDate, isoDateSchema } from "./dates";
export type { IsoDate } from "./dates";
export { INTERVIEW_ASKS, OUTPUT_KINDS, STAGE_PLANS, lookForRules } from "./stage-plans";
export type { InterviewAsk, OutputKind, StagePlan } from "./stage-plans";
export { GUIDANCE_KEYS, SAFETY_CATEGORIES, SAFETY_CUES, detectSafetyCues, safetyCueSchema } from "./safety-cues";
export type { GuidanceKey, SafetyCategory, SafetyCue, SafetyCueMatch } from "./safety-cues";
export { INSTRUCTION_CUES, flagInstructionChunks, looksLikeInstruction } from "./untrusted";
export type { InstructionFlag } from "./untrusted";
export {
  FLOW_STATUSES,
  FLOW_VERSION,
  INITIAL_FLOW_STATE,
  URGENT_WITHIN_DAYS,
  applyEvents,
  decide,
  describeState,
  transition,
} from "./flow";
export type {
  AnswerStyle,
  DeadlineOrigin,
  Decision,
  DocumentAnalysis,
  FlowClock,
  FlowContext,
  FlowEvent,
  FlowState,
  FlowStatus,
  SafetyEscalation,
  TextOrigin,
  Urgency,
} from "./flow";
export { decideAnswer, tidyQuestion } from "./answer";
export type { AnswerDecision, AnswerEvidence, AnswerOptions, NoEvidenceReason } from "./answer";
