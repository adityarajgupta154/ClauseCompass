import { z } from "zod";

/**
 * The grounding contract (PRD section 8): every document-derived statement the
 * product shows is a Claim that cites chunk ids from the uploaded document.
 * The server-side validator (validate.ts) only lets through claims whose
 * cited chunks were actually sent to the model and whose `quote` is found
 * verbatim in one of them; the client's SourceCard refuses to render a claim
 * that arrives with no usable citation anyway. Both sides read these schemas,
 * so a change here is a change to the contract.
 *
 * Field names are snake_case where the PRD names them, because the same keys
 * appear verbatim in the model's strict-JSON output.
 */

/** Where a chunk sits in the document. Page is null for formats without pages (TXT). */
export const sourceLocationSchema = z.object({
  page: z.number().int().positive().nullable(),
  /** 1-based paragraph index within the whole document. */
  paragraph: z.number().int().positive(),
  /** Detected clause or section label such as "7.1" or "Schedule I", when numbering exists. */
  clause: z.string().trim().min(1).nullable(),
});
export type SourceLocation = z.infer<typeof sourceLocationSchema>;

/** A retrievable excerpt of the document, the unit every citation points at. */
export const sourceChunkSchema = z.object({
  id: z.string().min(1),
  text: z.string().trim().min(1),
  location: sourceLocationSchema,
});
export type SourceChunk = z.infer<typeof sourceChunkSchema>;

/** Shape of a claim as it may arrive from the model, before citation checks. */
export const claimSchema = z.object({
  text: z.string().trim().min(1),
  source_chunk_ids: z.array(z.string().min(1)),
  /** Primary location (that of the first citation); null when the claim is uncited. */
  location: sourceLocationSchema.nullable(),
  confidence: z.number().min(0).max(1),
  /** Rule-registry category key, e.g. "notice", "money". Labels are the UI's job. */
  category: z.string().min(1),
  /**
   * The words of a cited chunk the statement rests on, copied verbatim. The
   * validator proves "the document says this" by finding it in the chunk;
   * optional here only so claims from before this field (demo data) still
   * parse on the client.
   */
  quote: z.string().trim().min(1).optional(),
});
export type Claim = z.infer<typeof claimSchema>;

/**
 * A claim as it leaves the validator: at least one citation, a location taken
 * from the first cited chunk (never from the model), and the verbatim quote
 * that was found in a cited chunk. Expressed structurally (not with .refine)
 * so it stays a plain object schema.
 */
export const groundedClaimSchema = claimSchema.extend({
  source_chunk_ids: z.array(z.string().min(1)).min(1),
  location: sourceLocationSchema,
  quote: z.string().trim().min(1),
});
export type GroundedClaim = z.infer<typeof groundedClaimSchema>;

/**
 * The confidence floor of the contract. A claim below it is shown with a
 * "check the source wording first" warning by the client, and a question
 * whose best evidence sits below it gets "the document doesn't answer this"
 * from the decision flow instead of an answer (PRD FR-08).
 */
export const LOW_CONFIDENCE_BELOW = 0.6;
