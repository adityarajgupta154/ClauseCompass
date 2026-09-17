import { describe, expect, it } from "vitest";
import type { DocumentMapResponse, GroundedClaim, HitRelevance, ReviewPrompt } from "@workspace/api-client-react";
import { indexChunks } from "@/features/grounding/resolve-claim";
import { MOCK_CHUNKS } from "@/features/grounding/mock-claims";
import { en } from "@/features/journey/copy";
import { chunkForSpeech } from "@/features/speech/read-aloud";
import { mapReading } from "@/pages/document-map";
import { reviewReading } from "@/pages/review-prompts";

/**
 * What the screen-level read-aloud says (Task 7.2). It must follow the
 * screen: a statement the card withholds (no usable citation) is not read
 * either, and a point the document is silent on is read as "not found".
 */

const chunks = indexChunks(MOCK_CHUNKS);
const grounded = (text: string, category = "notice"): GroundedClaim => ({
  text,
  quote: "notice",
  source_chunk_ids: [MOCK_CHUNKS[0].id],
  location: MOCK_CHUNKS[0].location,
  confidence: 0.9,
  category,
});
const ungrounded = (text: string): GroundedClaim => ({ ...grounded(text), source_chunk_ids: ["offer-letter:p999"] });

describe("mapReading", () => {
  it("reads each point's title and its shown statements, and skips a withheld one", () => {
    const data = {
      map: {
        fields: [
          { id: "termination", status: "found", claims: [grounded("Either side gives 15 days' notice."), ungrounded("A made-up statement.")], evidence: [], withheld: 1, reason: null },
          { id: "dispute", status: "not-found", claims: [], evidence: [], withheld: 0, reason: null },
        ],
      },
    } as unknown as DocumentMapResponse;
    const pieces = mapReading(data, chunks);
    expect(pieces).toEqual([
      `${en.map.fields.termination.title}.`,
      `${en.map.topics.notice}: Either side gives 15 days' notice.`,
      `${en.map.fields.dispute.title}.`,
      `${en.map.notFound.title}. ${en.map.notFound.body(en.map.fields.dispute.missing)}`,
    ]);
    expect(pieces.join(" ")).not.toContain("made-up");
  });
});

describe("reviewReading", () => {
  it("reads the groups in screen order with each prompt's name, reason and question, skipping a withheld question", () => {
    const prompt = (ruleId: string, relevance: HitRelevance, question: GroundedClaim): ReviewPrompt => ({
      ruleId,
      family: "exit",
      category: "notice",
      title: `Rule ${ruleId}`,
      whyItMatters: `Why ${ruleId} matters.`,
      relevance,
      prompt: question,
      phrasedBy: "model",
      reason: null,
      places: [],
    });
    const byRelevance = new Map<HitRelevance, ReviewPrompt[]>([
      ["primary", [prompt("a", "primary", grounded("Ask about a?"))]],
      ["secondary", []],
      ["background", [prompt("b", "background", ungrounded("Never read this."))]],
    ]);
    expect(reviewReading(byRelevance, chunks)).toEqual([
      `${en.review.groups.primary.title}.`,
      "Rule a. Why a matters.",
      "Ask about a?",
      `${en.review.groups.background.title}.`,
      "Rule b. Why b matters.",
    ]);
  });
});

describe("chunkForSpeech", () => {
  it("groups sentences up to the limit, keeps a long sentence whole and drops blanks", () => {
    expect(chunkForSpeech(["One. Two.", "", "  ", "Three!"], 10)).toEqual(["One. Two.", "Three!"]);
    // A sentence over the limit is split at a clause break, else a space, and nothing is lost.
    const long = "If you resign before eighteen months, you repay the training cost on a pro-rata basis; the company may adjust it against your dues.";
    const parts = chunkForSpeech([long], 60);
    expect(parts.every((part) => part.length <= 60)).toBe(true);
    expect(parts.join(" ")).toBe(long);
    expect(parts[0]).toBe("If you resign before eighteen months,");
    const words = "word ".repeat(30).trim();
    expect(chunkForSpeech([words], 24).every((part) => part.length <= 24 && !part.includes("wor d"))).toBe(true);
    expect(chunkForSpeech([words], 24).join(" ")).toBe(words);
    expect(chunkForSpeech(["x".repeat(25)], 10)).toEqual(["x".repeat(10), "x".repeat(10), "x".repeat(5)]);
    expect(chunkForSpeech(["Short. Also short. Third one."], 18)).toEqual(["Short. Also short.", "Third one."]);
    expect(chunkForSpeech([])).toEqual([]);
  });
});
