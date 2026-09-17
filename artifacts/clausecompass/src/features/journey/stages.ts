/**
 * The life moments a person can pick on the Welcome screen (PRD §5 step 1).
 * The id doubles as the `stage` signal the rule engine keys on (PRD §8), so
 * treat these ids as a stable contract, not UI labels: what each moment is
 * called and how it is described lives in the copy tables (`copy.stages`),
 * in both languages.
 */
export const STAGES = [{ id: "before-signing" }, { id: "problem-started" }, { id: "compare-versions" }] as const;

export type Stage = (typeof STAGES)[number];
export type StageId = Stage["id"];

export function isStageId(value: unknown): value is StageId {
  return STAGES.some((stage) => stage.id === value);
}
