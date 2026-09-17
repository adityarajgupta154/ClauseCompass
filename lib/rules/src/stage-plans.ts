import type { StageId } from "./contract";
import { rulesForStage } from "./engine";
import { RULE_REGISTRY } from "./registry";
import type { RuleFamilyId, RuleRegistry } from "./schema";

/**
 * What each life-moment stage asks the rest of the pipeline to do (PRD §8,
 * rows "Stage = Before signing" and "Stage = Problem started"; PRD FR-07 for
 * the compare stage). This is data the decision flow hands out; the
 * interview task turns `asks` into questions and the dashboard task turns
 * `outputs` into views.
 */

/** Things the minimal context interview should ask for (FR-03), as keys. */
export const INTERVIEW_ASKS = [
  /** By when the reader has to decide or sign; feeds urgency. */
  "decision-deadline",
  /** The dates of what happened so far; feeds the timeline. */
  "key-dates",
  /** Messages, receipts, photos the reader already has; feeds the evidence checklist. */
  "evidence",
  /** Any date by which the reader must act or reply; feeds urgency. */
  "response-deadline",
  /** Which of the two uploads is the newer one. */
  "newer-version",
] as const;
export type InterviewAsk = (typeof INTERVIEW_ASKS)[number];

/** Views the pipeline can build; each stage lists the ones it needs, in order. */
export const OUTPUT_KINDS = [
  "document-map",
  "review-prompts",
  "questions-to-ask",
  "timeline",
  "evidence-checklist",
  "change-cards",
] as const;
export type OutputKind = (typeof OUTPUT_KINDS)[number];

export interface StagePlan {
  stage: StageId;
  /** Rule families in the order they should lead the review at this stage. */
  families: readonly RuleFamilyId[];
  asks: readonly InterviewAsk[];
  outputs: readonly OutputKind[];
}

export const STAGE_PLANS: Readonly<Record<StageId, StagePlan>> = Object.freeze({
  // "Prioritize obligation/renewal/notice/money/IP/data clauses."
  "before-signing": Object.freeze({
    stage: "before-signing",
    families: Object.freeze(["duty", "time", "exit", "money", "data-ip"] as const),
    asks: Object.freeze(["decision-deadline"] as const),
    outputs: Object.freeze(["document-map", "review-prompts", "questions-to-ask"] as const),
  }),
  // "Ask for dates + evidence, look for remedy/notice clauses, build a timeline."
  "problem-started": Object.freeze({
    stage: "problem-started",
    families: Object.freeze(["exit", "time", "money", "duty", "data-ip"] as const),
    asks: Object.freeze(["key-dates", "evidence", "response-deadline"] as const),
    outputs: Object.freeze(["timeline", "review-prompts", "evidence-checklist", "document-map"] as const),
  }),
  // FR-07: change classes are wording / money / time / duty / remedy.
  "compare-versions": Object.freeze({
    stage: "compare-versions",
    families: Object.freeze(["money", "time", "duty", "exit", "data-ip"] as const),
    asks: Object.freeze(["newer-version"] as const),
    outputs: Object.freeze(["change-cards", "document-map"] as const),
  }),
});

/**
 * Rule ids to look for first at a stage: the registry's primary rules for
 * the stage, ordered by the plan's family order, then the secondary ones the
 * same way. The registry decides which rules matter at a stage; the plan
 * only decides which family goes first.
 */
export function lookForRules(stage: StageId, registry: RuleRegistry = RULE_REGISTRY): string[] {
  const familyRank = new Map(STAGE_PLANS[stage].families.map((family, index) => [family, index]));
  const listed = rulesForStage(stage, registry).map((entry, index) => ({ ...entry, index }));
  return listed
    .sort((a, b) => {
      if (a.relevance !== b.relevance) return a.relevance === "primary" ? -1 : 1;
      return (familyRank.get(a.rule.family) ?? 99) - (familyRank.get(b.rule.family) ?? 99) || a.index - b.index;
    })
    .map((entry) => entry.rule.id);
}
