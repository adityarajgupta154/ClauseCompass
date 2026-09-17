import { z } from "zod";

/**
 * What the model is allowed to say: the strict output schema of the
 * plain-language step (PRD section 7.2 and 7.3). Two views of one shape live
 * here on purpose. The Zod schema is what the validator parses; the JSON
 * Schema is what the model is constrained with (a forced tool call whose
 * input schema this is). model-output.test.ts checks that they agree, so a
 * limit changed in `MODEL_OUTPUT_LIMITS` reaches both.
 *
 * The model never outputs a location: page, paragraph and clause come from
 * the cited chunk itself once the citation has been verified.
 */

export const MODEL_OUTPUT_LIMITS = Object.freeze({
  /** Claims per call unless the caller asks for fewer; a question needs 1–3, a clause map a handful. */
  maxClaims: 8,
  /** One or two plain sentences; long text is a sign the model is explaining, not restating. */
  claimTextChars: 400,
  /** A verbatim span, not a whole clause. */
  quoteChars: 300,
  /** Shorter quotes ("the rent") prove nothing; the validator enforces this one. */
  quoteMinWords: 3,
  citationsPerClaim: 3,
  /** Category keys are short machine words; the prompt lists the allowed ones. */
  categoryChars: 40,
});

export interface ModelOutputOptions {
  /** Allowed category keys, usually the rule registry's. */
  categories: readonly string[];
  /** Upper bound on claims for this call; defaults to `MODEL_OUTPUT_LIMITS.maxClaims`. */
  maxClaims?: number;
}

const L = MODEL_OUTPUT_LIMITS;

function resolveMaxClaims(options: ModelOutputOptions): number {
  const max = options.maxClaims ?? L.maxClaims;
  if (!Number.isInteger(max) || max < 1 || max > L.maxClaims) {
    throw new RangeError(`maxClaims must be a whole number from 1 to ${L.maxClaims}, got ${max}`);
  }
  return max;
}

function resolveCategories(options: ModelOutputOptions): [string, ...string[]] {
  const categories = Array.from(new Set(options.categories));
  if (categories.length === 0) throw new RangeError("at least one category key is required");
  for (const category of categories) {
    if (category.trim() === "" || category.length > L.categoryChars) {
      throw new RangeError(`category key ${JSON.stringify(category)} is empty or longer than ${L.categoryChars}`);
    }
  }
  return categories as [string, ...string[]];
}

/** One statement as the model returns it: text, its verbatim support, citations, a category key and confidence. */
export function modelClaimSchema(options: ModelOutputOptions) {
  // .strict() mirrors additionalProperties: false below; a model that adds fields ignored the schema.
  return z
    .object({
      text: z.string().trim().min(1).max(L.claimTextChars),
      quote: z.string().trim().min(1).max(L.quoteChars),
      source_chunk_ids: z.array(z.string().min(1)).min(1).max(L.citationsPerClaim),
      category: z.enum(resolveCategories(options)),
      confidence: z.number().min(0).max(1),
    })
    .strict();
}
export type ModelClaim = z.infer<ReturnType<typeof modelClaimSchema>>;

/** The whole response: a possibly empty list of claims. Empty means "the excerpts do not support anything for this task". */
export function modelOutputSchema(options: ModelOutputOptions) {
  return z.object({ claims: z.array(modelClaimSchema(options)).max(resolveMaxClaims(options)) }).strict();
}
export type ModelOutput = z.infer<ReturnType<typeof modelOutputSchema>>;

/** The field descriptions the model reads in the schema: fixed text of the prompt, which the validator's recital check is given too. */
export const MODEL_OUTPUT_DESCRIPTIONS = Object.freeze({
  claims: "Plain-language statements, each supported by the excerpts. Empty when the excerpts do not support any statement for the task.",
  text: "One or two short plain-language sentences saying what the document says. No advice, no judgement of validity.",
  quote: `The exact words from one cited chunk that support the statement, copied verbatim (at least ${L.quoteMinWords} words, no paraphrase, no ellipsis).`,
  source_chunk_ids: "Ids of the excerpts the statement rests on. Only ids that appear in the excerpts.",
  category: "The category key that fits the statement best.",
  confidence: "How directly the quote supports the statement: 0.9 or more when it says it outright, under 0.6 when it takes interpretation.",
});

/** JSON Schema (draft 2020-12 subset every structured-output API accepts) for the same shape. */
export function modelOutputJsonSchema(options: ModelOutputOptions): Record<string, unknown> {
  const D = MODEL_OUTPUT_DESCRIPTIONS;
  return {
    type: "object",
    additionalProperties: false,
    required: ["claims"],
    properties: {
      claims: {
        type: "array",
        maxItems: resolveMaxClaims(options),
        description: D.claims,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["text", "quote", "source_chunk_ids", "category", "confidence"],
          properties: {
            text: { type: "string", minLength: 1, maxLength: L.claimTextChars, description: D.text },
            quote: { type: "string", minLength: 1, maxLength: L.quoteChars, description: D.quote },
            source_chunk_ids: {
              type: "array",
              minItems: 1,
              maxItems: L.citationsPerClaim,
              items: { type: "string", minLength: 1 },
              description: D.source_chunk_ids,
            },
            category: { type: "string", enum: resolveCategories(options), description: D.category },
            confidence: { type: "number", minimum: 0, maximum: 1, description: D.confidence },
          },
        },
      },
    },
  };
}
