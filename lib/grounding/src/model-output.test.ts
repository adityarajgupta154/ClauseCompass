import { describe, expect, it } from "vitest";
import { MODEL_OUTPUT_LIMITS, modelOutputJsonSchema, modelOutputSchema } from "./model-output";

/**
 * The Zod schema and the JSON Schema describe one shape; these tests keep
 * them from drifting apart, since the model is constrained by one and the
 * validator parses with the other.
 */

const options = { categories: ["notice", "money"] };

type Node = Record<string, unknown>;
const json = modelOutputJsonSchema(options) as Node;
const claims = (json.properties as Node).claims as Node;
const claim = claims.items as Node;
const props = claim.properties as Node;

describe("model output JSON Schema", () => {
  it("names the same claim fields as the Zod schema, all required", () => {
    const zodKeys = Object.keys(modelOutputSchema(options).shape.claims.element.shape).sort();
    expect((claim.required as string[]).slice().sort()).toEqual(zodKeys);
    expect(Object.keys(props).sort()).toEqual(zodKeys);
    expect(json.required).toEqual(["claims"]);
    expect(claim.additionalProperties).toBe(false);
  });

  it("carries the shared limits", () => {
    expect(claims.maxItems).toBe(MODEL_OUTPUT_LIMITS.maxClaims);
    expect((props.text as Node).maxLength).toBe(MODEL_OUTPUT_LIMITS.claimTextChars);
    expect((props.quote as Node).maxLength).toBe(MODEL_OUTPUT_LIMITS.quoteChars);
    expect((props.source_chunk_ids as Node).maxItems).toBe(MODEL_OUTPUT_LIMITS.citationsPerClaim);
    expect((props.category as Node).enum).toEqual(["notice", "money"]);
    expect((props.confidence as Node).minimum).toBe(0);
    expect((props.confidence as Node).maximum).toBe(1);
  });

  it("honours a smaller per-call claim cap in both views", () => {
    const small = { ...options, maxClaims: 2 };
    expect(((modelOutputJsonSchema(small).properties as Node).claims as Node).maxItems).toBe(2);
    const three = { claims: Array.from({ length: 3 }, () => sample()) };
    expect(modelOutputSchema(small).safeParse(three).success).toBe(false);
    expect(modelOutputSchema(options).safeParse(three).success).toBe(true);
  });

  it("refuses caps and category lists it cannot express", () => {
    expect(() => modelOutputSchema({ ...options, maxClaims: 0 })).toThrow(RangeError);
    expect(() => modelOutputSchema({ ...options, maxClaims: MODEL_OUTPUT_LIMITS.maxClaims + 1 })).toThrow(RangeError);
    expect(() => modelOutputSchema({ categories: [] })).toThrow(RangeError);
    expect(() => modelOutputJsonSchema({ categories: [" "] })).toThrow(RangeError);
  });

  it("parses a well-formed claim and rejects the obvious deviations", () => {
    const schema = modelOutputSchema(options);
    expect(schema.safeParse({ claims: [sample()] }).success).toBe(true);
    expect(schema.safeParse({ claims: [] }).success).toBe(true);
    expect(schema.safeParse({ claims: [{ ...sample(), confidence: 1.5 }] }).success).toBe(false);
    expect(schema.safeParse({ claims: [{ ...sample(), category: "vibes" }] }).success).toBe(false);
    expect(schema.safeParse({ claims: [{ ...sample(), source_chunk_ids: [] }] }).success).toBe(false);
    expect(schema.safeParse({ claims: [{ ...sample(), quote: "" }] }).success).toBe(false);
    expect(
      schema.safeParse({ claims: [{ ...sample(), text: "x".repeat(MODEL_OUTPUT_LIMITS.claimTextChars + 1) }] }).success,
    ).toBe(false);
    expect(schema.safeParse({ claim: [sample()] }).success).toBe(false);
  });

  it("rejects extra fields at both levels, as the JSON Schema's additionalProperties: false promises", () => {
    const schema = modelOutputSchema(options);
    expect(json.additionalProperties).toBe(false);
    expect(claim.additionalProperties).toBe(false);
    expect(schema.safeParse({ claims: [sample()], note: "extra" }).success).toBe(false);
    expect(schema.safeParse({ claims: [{ ...sample(), location: { page: 1 } }] }).success).toBe(false);
  });
});

function sample() {
  return {
    text: "Either side can end the agreement with one month's written notice.",
    quote: "one (1) month's prior written notice",
    source_chunk_ids: ["p24"],
    category: "notice",
    confidence: 0.9,
  };
}
