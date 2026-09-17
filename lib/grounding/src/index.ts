/**
 * @workspace/grounding - the citation contract of ClauseCompass.
 *
 * Owns document chunking (stable chunk ids), lexical retrieval over chunks,
 * and the output validator that rejects any model claim whose cited chunk ids
 * do not exist or whose quoted text is not found in the cited chunk
 * (PRD section 7.2 and 8). The API server renders nothing that has not
 * passed this validator.
 *
 * claim.ts holds the shared claim/chunk schemas that the client's SourceCard
 * and the server validator both read. retrieval.ts is the lexical retriever
 * (BM25 over Porter-stemmed terms, with a lay/Hinglish expansion table).
 * model-output.ts is the strict schema the model is held to (Zod and JSON
 * Schema views of one shape) and validate.ts the validator that turns a
 * model response into GroundedClaims or a rejection. Chunk ids are assigned
 * by the analysis pipeline that builds SourceChunks from extraction output.
 */
export {
  LOW_CONFIDENCE_BELOW,
  claimSchema,
  groundedClaimSchema,
  sourceChunkSchema,
  sourceLocationSchema,
  type Claim,
  type GroundedClaim,
  type SourceChunk,
  type SourceLocation,
} from "./claim";
export {
  BM25_DEFAULTS,
  RETRIEVE_DEFAULTS,
  analyzeQuery,
  buildIndex,
  retrieve,
  type Bm25Options,
  type IndexOptions,
  type Posting,
  type QueryTerm,
  type RetrievalHit,
  type RetrievalIndex,
  type RetrievalQuery,
  type RetrieveOptions,
} from "./retrieval";
export { isHeading } from "./heading";
export {
  MODEL_OUTPUT_DESCRIPTIONS,
  MODEL_OUTPUT_LIMITS,
  modelClaimSchema,
  modelOutputJsonSchema,
  modelOutputSchema,
  type ModelClaim,
  type ModelOutput,
  type ModelOutputOptions,
} from "./model-output";
export {
  LANGUAGE_REGISTERS,
  RESPONSIBLE_LANGUAGE,
  describeLanguageViolation,
  findLanguageViolations,
  isResponsibleLanguage,
  responsibleLanguageInstruction,
  reviewRegisterIssue,
  type LanguageRegister,
  type LanguageRule,
  type LanguageViolation,
} from "./language";
export {
  INSTRUCTION_ECHO_SHARE,
  INSTRUCTION_ECHO_WINDOW,
  INSTRUCTION_ECHO_WORDS,
  normalizeForMatch,
  validateModelOutput,
  type OutputFailure,
  type RegisterCheck,
  type RejectedClaim,
  type RejectionReason,
  type ValidateOptions,
  type ValidationResult,
} from "./validate";
export { stem } from "./stem";
export { QUERY_SYNONYMS } from "./synonyms";
export {
  MAX_TOKEN_LENGTH,
  SPELLINGS,
  STOPWORDS,
  analyzeDocument,
  isStopword,
  normalizeText,
  termOf,
  tokenize,
} from "./tokenize";
