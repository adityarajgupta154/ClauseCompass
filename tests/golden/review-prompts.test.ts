import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describeLanguageViolation, findLanguageViolations, type SourceChunk } from "@workspace/grounding";
import { STAGE_IDS, type StageId } from "@workspace/rules";
import { buildReviewPrompts, toSourceChunks, type ReviewPrompts } from "../../artifacts/api-server/src/analysis";
import { splitParagraphs } from "../../artifacts/api-server/src/extraction/paragraphs";
import { LlmError } from "../../artifacts/api-server/src/llm";
import { createMockProvider } from "../../artifacts/api-server/src/llm/mock";
import { copy } from "../../artifacts/clausecompass/src/features/journey/copy";

/**
 * Golden run of the Review Prompts over the synthetic documents (PRD FR-06,
 * section 8). Two things are pinned. Which rules fire on each document at
 * the before-signing stage, and which stage-leading rules are reported as
 * not found: the deterministic layer, reviewed as one when it changes. And
 * the acceptance line of the task: across all three documents and all
 * three stages, nothing a reader is shown - titles, reasons, prompts (model
 * or template), the view's own copy - is in a verdict, prediction, advice
 * or judgement register. The document's own words (the places) are quoted,
 * not checked.
 */

const root = new URL("../../", import.meta.url);

function loadFixture(file: string): SourceChunk[] {
  const paragraphs = splitParagraphs(readFileSync(new URL(`samples/${file}`, root), "utf8"));
  return toSourceChunks({
    chunks: paragraphs.map((text, index) => ({ text, page: null, paragraphIndex: index + 1 })),
  });
}

const fixtures = {
  rental: loadFixture("rental-agreement-synthetic.txt"),
  offer: loadFixture("offer-letter-synthetic.txt"),
  nda: loadFixture("nda-synthetic.txt"),
};

async function reviewOf(chunks: SourceChunk[], stage: StageId, provider = createMockProvider()): Promise<ReviewPrompts> {
  return buildReviewPrompts(chunks, { stage, provider, model: "mock" });
}

const ids = (review: ReviewPrompts, relevance?: ReviewPrompts["prompts"][number]["relevance"]) =>
  review.prompts.filter((prompt) => relevance === undefined || prompt.relevance === relevance).map((prompt) => prompt.ruleId);

/** Every string of the view's own copy, however nested. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") return strings((value as (...args: string[]) => unknown)("3", "clause 4.1", "the deposit"));
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

function violationsIn(texts: readonly string[]): string[] {
  return texts.flatMap((text) => findLanguageViolations(text).map((violation) => `${describeLanguageViolation(violation)} <- ${text}`));
}

describe("rental agreement", () => {
  it("fires the expected rules before signing, primary ones first in the stage's family order, and reports the leading rules it did not find", async () => {
    const review = await reviewOf(fixtures.rental, "before-signing");
    expect(ids(review, "primary")).toEqual([
      "duty.conditions",
      "time.term",
      "time.renewal",
      "exit.notice",
      "exit.termination",
      "exit.lock-in",
      "exit.remedies",
      "money.payment-terms",
      "money.deposit",
      "money.late-fees",
      "data-ip.monitoring",
    ]);
    expect(ids(review, "secondary")).toEqual([
      "duty.restrictions",
      "duty.upkeep",
      "time.deadline",
      "exit.notice-service",
      "exit.handover",
      "exit.disputes",
      "money.who-pays",
    ]);
    expect(ids(review, "background")).toEqual(["time.dated"]);
    expect(review.notFound.map((absent) => absent.ruleId)).toEqual([
      "duty.non-compete",
      "duty.non-solicit",
      "duty.one-sided",
      "duty.hours",
      "duty.one-way",
      "time.probation",
      "time.survival",
      "exit.liability",
      "money.bond-repayment",
      "money.discretionary",
      "data-ip.confidentiality",
      "data-ip.ip",
      "data-ip.personal-data",
      "data-ip.handling",
    ]);
    // The mock phrases every rule it is asked about; background rules carry their templates and were not sent.
    expect(review.prompts.filter((prompt) => prompt.relevance !== "background").every((prompt) => prompt.phrasedBy === "model")).toBe(true);
    expect(review.prompts.filter((prompt) => prompt.relevance === "background").every((prompt) => prompt.reason === "not-asked")).toBe(true);
    expect(review.withheld).toBe(0);
  });

  it("scopes the not-found list to the document type: rules for other kinds of document are not reported missing", async () => {
    const review = await buildReviewPrompts(fixtures.rental, { stage: "before-signing", documentType: "rental", provider: createMockProvider(), model: "mock" });
    const missing = review.notFound.map((absent) => absent.ruleId);
    expect(missing).not.toContain("time.probation");
    expect(missing).not.toContain("duty.hours");
    expect(missing).toContain("money.discretionary");
  });

  it("shows every place a rule fired on, quoted from the document, and the prompt rests on one of them", async () => {
    const review = await reviewOf(fixtures.rental, "before-signing");
    for (const prompt of review.prompts) {
      expect(prompt.places.length).toBeGreaterThan(0);
      for (const place of prompt.places) {
        const chunk = fixtures.rental.find((chunk) => chunk.id === place.source_chunk_ids[0])!;
        expect(chunk.text).toContain(place.quote);
      }
      expect(prompt.places.map((place) => place.source_chunk_ids[0])).toEqual(expect.arrayContaining(prompt.prompt.source_chunk_ids));
      const chunk = fixtures.rental.find((chunk) => chunk.id === prompt.prompt.source_chunk_ids[0])!;
      expect(chunk.text).toContain(prompt.prompt.quote);
    }
  });

  it("changes with the stage: once a problem has started, the exit rules lead and the dated wording is no longer background", async () => {
    const review = await reviewOf(fixtures.rental, "problem-started");
    expect(ids(review, "primary")).toEqual([
      "exit.notice",
      "exit.notice-service",
      "exit.termination",
      "exit.lock-in",
      "exit.handover",
      "exit.remedies",
      "exit.disputes",
      "time.deadline",
      "time.dated",
      "money.deposit",
      "money.late-fees",
      "duty.upkeep",
    ]);
    expect(ids(review, "background")).toEqual([]);
    expect(review.notFound.map((absent) => absent.ruleId)).toEqual(["exit.liability", "money.bond-repayment", "data-ip.incident"]);
  });
});

describe("offer letter", () => {
  it("fires the expected rules before signing and reports what it did not find", async () => {
    const review = await reviewOf(fixtures.offer, "before-signing");
    expect(ids(review, "primary")).toEqual([
      "duty.non-compete",
      "duty.non-solicit",
      "duty.one-sided",
      "duty.hours",
      "duty.conditions",
      "time.term",
      "time.probation",
      "time.survival",
      "exit.notice",
      "exit.termination",
      "exit.lock-in",
      "money.payment-terms",
      "money.bond-repayment",
      "money.discretionary",
      "data-ip.confidentiality",
      "data-ip.ip",
      "data-ip.personal-data",
      "data-ip.monitoring",
    ]);
    expect(ids(review, "secondary")).toEqual(["duty.restrictions", "time.deadline", "exit.handover", "exit.disputes"]);
    expect(review.notFound.map((absent) => absent.ruleId)).toEqual([
      "duty.one-way",
      "time.renewal",
      "exit.remedies",
      "exit.liability",
      "money.deposit",
      "money.late-fees",
      "data-ip.handling",
    ]);
    expect(review.withheld).toBe(0);
  });
});

describe("nda", () => {
  it("fires the expected rules before signing and reports what it did not find", async () => {
    const review = await reviewOf(fixtures.nda, "before-signing");
    expect(ids(review, "primary")).toEqual([
      "duty.non-solicit",
      "duty.one-sided",
      "duty.one-way",
      "time.term",
      "time.survival",
      "exit.notice",
      "exit.termination",
      "exit.remedies",
      "data-ip.confidentiality",
      "data-ip.ip",
      "data-ip.handling",
    ]);
    expect(ids(review, "secondary")).toEqual([
      "duty.restrictions",
      "time.deadline",
      "exit.notice-service",
      "exit.handover",
      "exit.disputes",
      "money.who-pays",
      "data-ip.incident",
    ]);
    expect(review.notFound.map((absent) => absent.ruleId)).toEqual([
      "duty.non-compete",
      "duty.hours",
      "duty.conditions",
      "time.renewal",
      "time.probation",
      "exit.lock-in",
      "exit.liability",
      "money.payment-terms",
      "money.deposit",
      "money.late-fees",
      "money.bond-repayment",
      "money.discretionary",
      "data-ip.personal-data",
      "data-ip.monitoring",
    ]);
    // The confidentiality rule fires throughout an NDA; every place is listed, the model saw only the first two.
    const confidentiality = review.prompts.find((prompt) => prompt.ruleId === "data-ip.confidentiality")!;
    expect(confidentiality.places.length).toBeGreaterThan(10);
    expect(confidentiality.phrasedBy).toBe("model");
  });
});

describe("acceptance: responsible language", () => {
  it("shows nothing conclusory or outcome-predicting across all three documents and all three stages", async () => {
    const offenders: string[] = [];
    for (const [name, chunks] of Object.entries(fixtures)) {
      for (const stage of STAGE_IDS) {
        const review = await reviewOf(chunks, stage);
        const shown = review.prompts.flatMap((prompt) => [prompt.title, prompt.whyItMatters, prompt.prompt.text]);
        shown.push(...review.notFound.map((absent) => absent.title));
        offenders.push(...violationsIn(shown).map((line) => `${name}/${stage}: ${line}`));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("holds for the template path too: with the model unavailable every prompt is a registry template and still passes", async () => {
    const unavailable = createMockProvider(() => {
      throw new LlmError("overloaded", "529 from provider", 529);
    });
    const offenders: string[] = [];
    for (const [name, chunks] of Object.entries(fixtures)) {
      const review = await reviewOf(chunks, "before-signing", unavailable);
      expect(review.prompts.every((prompt) => prompt.phrasedBy === "template")).toBe(true);
      expect(review.prompts.filter((prompt) => prompt.relevance !== "background").every((prompt) => prompt.reason === "model-unavailable")).toBe(true);
      const shown = review.prompts.map((prompt) => prompt.prompt.text);
      offenders.push(...violationsIn(shown).map((line) => `${name}: ${line}`));
    }
    expect(offenders).toEqual([]);
  });

  it("holds for the view's own copy", () => {
    expect(violationsIn(strings(copy.review))).toEqual([]);
  });
});
