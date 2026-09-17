import type { SourceChunk } from "@workspace/grounding";
import { describe, expect, it } from "vitest";
import { reviewRegisterIssue } from "@workspace/grounding";
import { generateClaims } from "./claims";
import { createMockProvider } from "./mock";

/**
 * The offline provider must produce output that passes the same validator a
 * real model's would, or LLM_PROVIDER=mock would exercise nothing.
 */

const chunks: SourceChunk[] = [
  {
    id: "p24",
    text: "4.2 Either party may terminate this agreement by giving one (1) month's prior written notice to the other.",
    location: { page: 2, paragraph: 24, clause: "4.2" },
  },
  {
    id: "p12",
    text: "2.1 The Licensee shall pay a monthly licence fee of ₹18,000. Payment is due on the 5th.",
    location: { page: 1, paragraph: 12, clause: "2.1" },
  },
];

describe("mock provider", () => {
  it("restates each excerpt with a verbatim quote that the validator accepts, visibly marked as demo output", async () => {
    const result = await generateClaims(
      { task: "Map the clauses.", chunks, categories: ["notice", "payment"], maxClaims: 2 },
      createMockProvider(),
      { model: "mock" },
    );
    expect(result).toMatchObject({ ok: true, attempts: 1, withheld: 0 });
    if (!result.ok) return;
    expect(result.claims).toHaveLength(2);
    for (const claim of result.claims) {
      expect(claim.text).toMatch(/^Demo output \(mock model, not analysis\)/);
      expect(claim.category).toBe("notice");
    }
    expect(result.claims[1]!.text).toContain('"2.1 The Licensee shall pay a monthly licence fee of ₹18,000."');
    expect(result.claims[1]!.quote).toBe("2.1 The Licensee shall pay a monthly licence");
  });

  it("follows a task line's assignments with one prompt per key, phrased as a check so the review register accepts it", async () => {
    const result = await generateClaims(
      {
        task: "Phrase one prompt per rule. notice (Notice period): p24. payment (Fee): p12",
        chunks,
        categories: ["notice", "payment"],
        maxClaims: 2,
        register: reviewRegisterIssue,
      },
      createMockProvider(),
      { model: "mock" },
    );
    expect(result).toMatchObject({ ok: true, attempts: 1, withheld: 0 });
    if (!result.ok) return;
    expect(result.claims.map((claim) => [claim.category, claim.source_chunk_ids[0]])).toEqual([
      ["notice", "p24"],
      ["payment", "p12"],
    ]);
    expect(result.claims[0]!.text).toBe(
      'Demo output (mock model, not analysis): check the passage that begins "4.2 Either party may terminate this agreement by giving one (1) month\'s prior written notice to the other.".',
    );
  });

  it("respects the per-call claim cap", async () => {
    const result = await generateClaims(
      { task: "Answer.", chunks, categories: ["notice"], maxClaims: 1 },
      createMockProvider(),
      { model: "mock" },
    );
    expect(result.ok && result.claims.length).toBe(1);
  });
});
