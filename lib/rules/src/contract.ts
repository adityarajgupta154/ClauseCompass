/**
 * The two signals the rule layer keys on (PRD §8): where the person is in
 * their situation, and what kind of document they brought. Both are stable
 * machine ids shared with the client (its stage picker and sample manifest
 * use the same strings); labels are the UI's business.
 */

export const STAGE_IDS = ["before-signing", "problem-started", "compare-versions"] as const;
export type StageId = (typeof STAGE_IDS)[number];

export const DOCUMENT_TYPES = ["offer_letter", "rental", "nda"] as const;
export type DocumentTypeId = (typeof DOCUMENT_TYPES)[number];

export function isStageId(value: unknown): value is StageId {
  return STAGE_IDS.includes(value as StageId);
}

export function isDocumentTypeId(value: unknown): value is DocumentTypeId {
  return DOCUMENT_TYPES.includes(value as DocumentTypeId);
}
