import { describe, expect, it } from "vitest";
import { findLanguageViolations, groundedClaimSchema, type SourceChunk } from "@workspace/grounding";
import { evaluateRules, RULE_REGISTRY, rulesForStage, STAGE_PLANS } from "@workspace/rules";
import { LlmError, type LlmRequest } from "../llm";
import { createMockProvider, demoOutput, mockClaim } from "../llm/mock";
import { splitParagraphs } from "../extraction/paragraphs";
import { toSourceChunks } from "./chunks";
import {
  absentPrimaryRules,
  buildReviewPrompts,
  GENERIC_PROMPT,
  MAX_CALL_CHARS,
  MAX_CALL_CHUNKS,
  PLACES_SENT_PER_RULE,
  placeClaims,
  selectExcerpts,
  taskFor,
  type ReviewPrompt,
} from "./review-prompts";

/**
 * A small agreement with several rules per family and one rule (the
 * confidentiality wording) that fires in more than two places, so the
 * batching, the excerpt caps and every fallback can be driven deliberately.
 */
const AGREEMENT = `
LEAVE AND LICENCE AGREEMENT

This Agreement is made at Pune on 24th day of February 2026 between Mr. Devraj Kulkarni (the "LICENSOR") and Mr. Imran Shaikh (the "LICENSEE").

1. PERIOD

1.1 The Licensor grants the Licensee a licence for a period of eleven (11) months commencing on 1 March 2026 and ending on 31 January 2027.

1.2 The licence fee shall be revised upward by 10% on renewal and the Licensee shall have a lock-in period of six (6) months during which the Licensee may not vacate.

2. LICENCE FEE

2.1 The Licensee shall pay to the Licensor a monthly licence fee of Rs. 18,000/- (Rupees Eighteen Thousand only) on or before the 5th day of each calendar month.

2.2 The Licensee has paid an interest-free refundable security deposit of Rs. 54,000/- which shall be refunded within thirty (30) days of vacating, after deducting unpaid dues and the cost of repairs.

2.3 Any delay in payment beyond the due date shall attract a late fee of Rs. 500/- per day of delay.

3. USE

3.1 The Licensee shall not sublet the premises or use them for any commercial purpose without the prior written consent of the Licensor.

3.2 The Licensee shall keep confidential the terms of this Agreement and all information about the Licensor's family.

3.3 The Licensee shall keep confidential any access codes issued for the building.

3.4 The Licensee shall keep confidential the contact details of other occupants and shall not share them with any third party.

4. TERMINATION

4.1 Either party may terminate this Agreement by giving one (1) month's prior written notice to the other party.

4.2 On termination the Licensee shall hand over vacant possession of the premises in the same condition as at the start of the licence, fair wear and tear excepted.

5. GOVERNING LAW

5.1 This Agreement shall be governed by the laws of India and the courts at Pune shall have exclusive jurisdiction over any dispute arising out of this Agreement.
`;

function chunksOf(text: string): SourceChunk[] {
  return toSourceChunks({
    chunks: splitParagraphs(text).map((paragraph, index) => ({ text: paragraph, page: null, paragraphIndex: index + 1 })),
  });
}

/** The family a request is about, read from the category keys the pipeline allowed. */
function familyOf(request: LlmRequest) {
  const options = (
    request.output.schema.properties as { claims: { items: { properties: { category: { enum: string[] } } } } }
  ).claims.items.properties.category.enum;
  return RULE_REGISTRY.rules.find((rule) => rule.category === options[0])?.family;
}

function byRule(prompts: ReviewPrompt[]) {
  return Object.fromEntries(prompts.map((prompt) => [prompt.ruleId, prompt])) as Record<string, ReviewPrompt>;
}

/** Everything a reader could see for a prompt card. */
function readerFacing(prompt: ReviewPrompt): string[] {
  return [prompt.title, prompt.whyItMatters, prompt.prompt.text, ...prompt.places.map((place) => place.text)];
}

const base = { model: "mock", stage: "before-signing" as const };

describe("buildReviewPrompts", () => {
  const chunks = chunksOf(AGREEMENT);
  const hits = evaluateRules(chunks, { stage: "before-signing" });
  const firedIds = new Set(hits.map((hit) => hit.ruleId));

  it("returns one prompt per rule that fired, primary rules first, then the stage's family order", async () => {
    const { prompts, notFound, registryVersion, stage } = await buildReviewPrompts(chunks, { ...base, provider: createMockProvider() });

    expect(registryVersion).toBe(RULE_REGISTRY.version);
    expect(stage).toBe("before-signing");
    expect(new Set(prompts.map((prompt) => prompt.ruleId))).toEqual(firedIds);
    expect(prompts.length).toBe(firedIds.size);

    const rank = { primary: 0, secondary: 1, background: 2 };
    const familyRank = new Map(STAGE_PLANS["before-signing"].families.map((family, index) => [family, index]));
    const keys = prompts.map((prompt) => [rank[prompt.relevance], familyRank.get(prompt.family)!]);
    const sorted = [...keys].sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);
    expect(keys).toEqual(sorted);
    expect(prompts[0]!.relevance).toBe("primary");
    expect(prompts.some((prompt) => prompt.relevance === "background")).toBe(true);

    for (const absent of notFound) expect(firedIds.has(absent.ruleId)).toBe(false);
  });

  it("phrases primary and secondary rules with the model, one call per family, and cites the rule's own places", async () => {
    const requests: LlmRequest[] = [];
    const provider = createMockProvider((request) => {
      requests.push(request);
      return demoOutput(request);
    });
    const { prompts } = await buildReviewPrompts(chunks, { ...base, provider });

    const families = requests.map(familyOf);
    expect(new Set(families).size).toBe(families.length);
    for (const request of requests) {
      const asked = (request.output.schema.properties as { claims: { maxItems: number } }).claims.maxItems;
      expect(asked).toBeLessThanOrEqual(MAX_CALL_CHUNKS);
    }

    for (const prompt of prompts) {
      if (prompt.relevance === "background") continue;
      expect(prompt.phrasedBy).toBe("model");
      expect(prompt.reason).toBeNull();
      expect(groundedClaimSchema.parse(prompt.prompt)).toEqual(prompt.prompt);
      expect(prompt.prompt.category).toBe(prompt.category);
      const placeIds = prompt.places.map((place) => place.source_chunk_ids[0]);
      expect(placeIds).toEqual(expect.arrayContaining(prompt.prompt.source_chunk_ids));
    }
  });

  it("shows background rules with the registry's template and never sends them to the model", async () => {
    const sentCategories = new Set<string>();
    const provider = createMockProvider((request) => {
      for (const key of (request.output.schema.properties as { claims: { items: { properties: { category: { enum: string[] } } } } })
        .claims.items.properties.category.enum) {
        sentCategories.add(key);
      }
      return demoOutput(request);
    });
    const { prompts } = await buildReviewPrompts(chunks, { ...base, provider });
    const background = prompts.filter((prompt) => prompt.relevance === "background");
    expect(background.length).toBeGreaterThan(0);
    for (const prompt of background) {
      expect(sentCategories.has(prompt.category)).toBe(false);
      expect(prompt.phrasedBy).toBe("template");
      expect(prompt.reason).toBe("not-asked");
      // The registry's prompt for the first place the rule fired on, rendered by the engine for that clause.
      const firstHit = hits.filter((hit) => hit.ruleId === prompt.ruleId).sort((a, b) => a.chunkIndex - b.chunkIndex)[0]!;
      expect(prompt.prompt.text).toBe(firstHit.reviewPrompt);
      expect(prompt.prompt.source_chunk_ids).toEqual([firstHit.chunk.id]);
      expect(prompt.prompt.quote).toBe(prompt.places[0]!.quote);
      expect(prompt.prompt.confidence).toBe(1);
    }
  });

  it("lists every place a rule fired on, in document order, as the document's own words", async () => {
    const { prompts } = await buildReviewPrompts(chunks, { ...base, provider: createMockProvider() });
    const confidentiality = byRule(prompts)["data-ip.confidentiality"]!;
    expect(confidentiality.places.map((place) => place.location.paragraph)).toEqual(
      [...confidentiality.places.map((place) => place.location.paragraph)].sort((a, b) => a - b),
    );
    expect(confidentiality.places.length).toBeGreaterThan(PLACES_SENT_PER_RULE);
    for (const place of confidentiality.places) {
      expect(groundedClaimSchema.parse(place)).toEqual(place);
      expect(place.confidence).toBe(1);
      expect(place.category).toBe("confidentiality");
      const cited = chunks.find((chunk) => chunk.id === place.source_chunk_ids[0])!;
      expect(cited.text).toContain(place.quote);
      expect(cited.text).toContain(place.text.replace(/\u2026/g, ""));
    }
  });

  it("falls back to the template for one family when the model is unavailable, naming the reason", async () => {
    const provider = createMockProvider((request) => {
      if (familyOf(request) === "money") throw new LlmError("overloaded", "529 from provider", 529);
      return demoOutput(request);
    });
    const { prompts } = await buildReviewPrompts(chunks, { ...base, provider });
    const money = prompts.filter((prompt) => prompt.family === "money" && prompt.relevance !== "background");
    const others = prompts.filter((prompt) => prompt.family !== "money" && prompt.relevance !== "background");
    expect(money.length).toBeGreaterThan(1);
    for (const prompt of money) {
      expect(prompt.phrasedBy).toBe("template");
      expect(prompt.reason).toBe("model-unavailable");
      expect(groundedClaimSchema.parse(prompt.prompt)).toEqual(prompt.prompt);
    }
    expect(others.every((prompt) => prompt.phrasedBy === "model")).toBe(true);
  });

  it("falls back to the template for a rule the model said nothing verifiable about, and counts what was withheld", async () => {
    const provider = createMockProvider((request) => {
      if (familyOf(request) !== "exit") return demoOutput(request);
      return {
        claims: [
          // Cites a paragraph that was never sent: the validator withholds it.
          { text: "Confirm the notice period.", quote: "one (1) month", source_chunk_ids: ["p99"], category: "notice", confidence: 0.9 },
        ],
      };
    });
    const { prompts, withheld } = await buildReviewPrompts(chunks, { ...base, provider });
    const exit = prompts.filter((prompt) => prompt.family === "exit" && prompt.relevance !== "background");
    expect(exit.length).toBeGreaterThan(0);
    for (const prompt of exit) {
      expect(prompt.phrasedBy).toBe("template");
      expect(prompt.reason).toBe("nothing-verified");
    }
    expect(withheld).toBe(1);
  });

  it("withholds a conclusory prompt and shows the template instead", async () => {
    const provider = createMockProvider((request) => {
      if (familyOf(request) !== "money") return demoOutput(request);
      const excerpts = JSON.parse(request.user.trimEnd().split("\n").at(-1)!) as { id: string; text: string }[];
      const late = excerpts.find((excerpt) => excerpt.text.includes("late fee"))!;
      // Same verdict on both attempts: the validator rejects it twice and nothing is placed for that rule.
      return {
        claims: [
          {
            text: "A late fee of Rs. 500 per day is illegal, so you should refuse to pay it.",
            quote: "late fee of Rs. 500/- per day",
            source_chunk_ids: [late.id],
            category: "penalty",
            confidence: 0.8,
          },
        ],
      };
    });
    const { prompts, withheld } = await buildReviewPrompts(chunks, { ...base, provider });
    const lateFee = byRule(prompts)["money.late-fees"]!;
    expect(lateFee.phrasedBy).toBe("template");
    expect(lateFee.reason).toBe("nothing-verified");
    expect(withheld).toBe(1);
    for (const prompt of prompts) {
      for (const text of readerFacing(prompt)) {
        if (prompt.places.some((place) => place.text === text)) continue; // the document's own words are quoted, not checked
        expect(findLanguageViolations(text)).toEqual([]);
      }
    }
  });

  it("returns no prompts and every primary rule as not found on a document with nothing to review, without calling the model", async () => {
    let calls = 0;
    const provider = createMockProvider((request) => {
      calls += 1;
      return demoOutput(request);
    });
    const plain = chunksOf("A NOTE\n\nThe garden is watered on Tuesdays.\n\nThe gate is painted green.");
    const result = await buildReviewPrompts(plain, { ...base, provider });
    expect(calls).toBe(0);
    expect(result.prompts).toEqual([]);
    expect(result.withheld).toBe(0);
    const primary = rulesForStage("before-signing").filter(({ relevance }) => relevance === "primary");
    expect(result.notFound.map((absent) => absent.ruleId).sort()).toEqual(primary.map(({ rule }) => rule.id).sort());
  });

  it("propagates the caller's abort instead of reporting a state", async () => {
    const controller = new AbortController();
    const provider = createMockProvider(() => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    });
    await expect(buildReviewPrompts(chunks, { ...base, provider, signal: controller.signal })).rejects.toThrow();
  });
});

describe("absentPrimaryRules", () => {
  it("respects the document type: a rule scoped to other types is not reported missing", () => {
    const rentalOnly = RULE_REGISTRY.rules.filter((rule) => rule.documentTypes && !rule.documentTypes.includes("nda"));
    expect(rentalOnly.length).toBeGreaterThan(0);
    const forNda = absentPrimaryRules("before-signing", "nda", new Set());
    for (const rule of rentalOnly) expect(forNda.map((absent) => absent.ruleId)).not.toContain(rule.id);
    const untyped = absentPrimaryRules("before-signing", undefined, new Set());
    expect(untyped.length).toBeGreaterThan(forNda.length);
    // Stage's family order, then registry order.
    const familyRank = new Map(STAGE_PLANS["before-signing"].families.map((family, index) => [family, index]));
    const ranks = untyped.map((absent) => familyRank.get(absent.family)!);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});

describe("excerpt selection and claim placement", () => {
  const chunks = chunksOf(AGREEMENT);
  const hits = evaluateRules(chunks, { stage: "before-signing" });
  const rule = (id: string) => RULE_REGISTRY.rules.find((rule) => rule.id === id)!;
  const fired = (id: string) => ({
    rule: rule(id),
    relevance: "primary" as const,
    hits: hits.filter((hit) => hit.ruleId === id).sort((a, b) => a.chunkIndex - b.chunkIndex),
  });

  it("sends at most PLACES_SENT_PER_RULE places per rule, first places first, in document order", () => {
    const confidentiality = fired("data-ip.confidentiality");
    expect(confidentiality.hits.length).toBeGreaterThan(PLACES_SENT_PER_RULE);
    const batch = selectExcerpts("data-ip", [confidentiality]);
    expect(batch.chunks.map((chunk) => chunk.id)).toEqual(confidentiality.hits.slice(0, PLACES_SENT_PER_RULE).map((hit) => hit.chunk.id));
    expect(batch.unsent.size).toBe(0);
    expect(taskFor(batch)).toContain(`confidentiality (${confidentiality.rule.title}): ${batch.chunks.map((chunk) => chunk.id).join(", ")}`);
    // The task line names ids and titles, never the document's words.
    expect(taskFor(batch)).not.toMatch(/Licensee|access codes/);
  });

  it("gives every rule its first place before any rule gets a second, and stops at the chunk cap", () => {
    const many = Array.from({ length: MAX_CALL_CHUNKS }, (_, index) => {
      const source = fired("data-ip.confidentiality");
      return {
        ...source,
        rule: { ...source.rule, id: `x.rule-${index}`, category: `cat-${index}` },
        hits: source.hits.map((hit, position) => ({
          ...hit,
          ruleId: `x.rule-${index}`,
          chunkIndex: index * 10 + position,
          chunk: { ...hit.chunk, id: `c${index}-${position}` },
        })),
      };
    });
    const batch = selectExcerpts("data-ip", many);
    expect(batch.chunks).toHaveLength(MAX_CALL_CHUNKS);
    expect(batch.chunks.map((chunk) => chunk.id)).toEqual(many.map((entry) => entry.hits[0]!.chunk.id));
    expect(batch.unsent.size).toBe(0);
  });

  it("skips a paragraph that would overflow the character cap and marks a rule with no excerpt in as unsent", () => {
    // Every paragraph padded past the window size: each excerpt is MAX_EXCERPT_CHARS long, so the third overflows the call.
    const padded = (id: string) => {
      const entry = fired(id);
      entry.hits = entry.hits.map((hit) => ({ ...hit, chunk: { ...hit.chunk, text: hit.chunk.text + " x".repeat(MAX_CALL_CHARS) } }));
      return entry;
    };
    const payment = padded("money.payment-terms");
    const deposit = padded("money.deposit");
    const lateFees = padded("money.late-fees");
    const batch = selectExcerpts("money", [payment, deposit, lateFees]);
    expect(batch.chunks.map((chunk) => chunk.id)).toEqual([payment.hits[0]!.chunk.id, deposit.hits[0]!.chunk.id]);
    expect(batch.chunks.reduce((sum, chunk) => sum + chunk.text.length, 0)).toBeLessThanOrEqual(MAX_CALL_CHARS);
    expect(batch.unsent).toEqual(new Set(["money.late-fees"]));
    expect(taskFor(batch)).not.toContain("penalty (");
    expect(taskFor(batch)).toContain("deposit (");
  });

  it("places a claim by its category when its quote comes from that rule's excerpt, otherwise by the excerpt when unambiguous, and counts the rest", () => {
    const deposit = fired("money.deposit");
    const lateFee = fired("money.late-fees");
    const batch = selectExcerpts("money", [deposit, lateFee]);
    const depositChunk = deposit.hits[0]!.chunk;
    const lateChunk = lateFee.hits[0]!.chunk;
    const elsewhere = { page: null, paragraph: 99, clause: null };
    const claims = [
      { ...mockClaim(depositChunk, "deposit"), location: depositChunk.location, confidence: 0.6 },
      { ...mockClaim(depositChunk, "deposit"), location: depositChunk.location, confidence: 0.9 }, // duplicate: the more confident one wins, the other is counted
      { ...mockClaim(lateChunk, "deposit"), location: lateChunk.location, confidence: 0.7 }, // wrong key, but the excerpt was selected for late-fee alone
      { ...mockClaim({ id: "p99", text: "never sent" }, "penalty"), location: elsewhere, confidence: 0.9 }, // cites nothing that was sent
    ];
    const { placed, dropped } = placeClaims(batch, claims);
    expect([...placed.keys()].sort()).toEqual(["money.deposit", "money.late-fees"]);
    expect(placed.get("money.deposit")).toMatchObject({ by: "category", claim: { confidence: 0.9 } });
    // Placed by excerpt, so the claim carries the rule's own key rather than the one the model slipped on.
    expect(placed.get("money.late-fees")).toMatchObject({ by: "excerpt", claim: { confidence: 0.7, category: "penalty" } });
    expect(dropped).toBe(2);
  });

  it("does not let a claim rest on another rule's excerpt just because a second citation names the right one", () => {
    const deposit = fired("money.deposit");
    const lateFee = fired("money.late-fees");
    const batch = selectExcerpts("money", [deposit, lateFee]);
    const depositChunk = deposit.hits[0]!.chunk;
    const lateChunk = lateFee.hits[0]!.chunk;
    // The validator orders citations quote-bearing first: this claim quotes the late-fee paragraph and merely also cites the deposit one.
    const claim = { ...mockClaim(lateChunk, "deposit"), source_chunk_ids: [lateChunk.id, depositChunk.id], location: lateChunk.location };
    const { placed, dropped } = placeClaims(batch, [claim]);
    expect(placed.get("money.deposit")).toBeUndefined();
    expect(placed.get("money.late-fees")).toMatchObject({ by: "excerpt", claim: { category: "penalty" } });
    expect(dropped).toBe(0);
  });

  it("credits a shared long paragraph to a second rule only when that rule's wording is inside the window sent", () => {
    const deposit = fired("money.deposit");
    const lateFee = fired("money.late-fees");
    const depositChunk = deposit.hits[0]!.chunk;
    // One paragraph both rules fire on: the deposit wording first, then padding past the window, then the late-fee wording.
    const lateMatch = lateFee.hits[0]!.matched;
    const shared = { ...depositChunk, id: "shared", text: `${depositChunk.text} ${"filler ".repeat(1200)}${lateMatch} applies.` };
    deposit.hits = [{ ...deposit.hits[0]!, chunk: shared }];
    lateFee.hits = [{ ...lateFee.hits[0]!, chunk: shared, chunkIndex: deposit.hits[0]!.chunkIndex }];
    const batch = selectExcerpts("money", [deposit, lateFee]);
    expect(batch.chunks).toHaveLength(1);
    expect(batch.chunks[0]!.text).not.toContain(lateMatch);
    expect(batch.rulesByChunk.get("shared")).toEqual(new Set(["money.deposit"]));
    expect(batch.unsent).toEqual(new Set(["money.late-fees"]));
  });

  it("keeps the generic prompt inside the review register", () => {
    expect(findLanguageViolations(GENERIC_PROMPT("clause 4.1"))).toEqual([]);
  });
});
