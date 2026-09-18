import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectClauseLabel } from "@workspace/rules";
import { askDocument, type Answer } from "../../artifacts/api-server/src/analysis";
import { splitParagraphs } from "../../artifacts/api-server/src/extraction/paragraphs";
import { createLlmProvider, type LlmProvider } from "../../artifacts/api-server/src/llm";
import { GOLDEN_QUESTIONS } from "./questions";

/**
 * Golden run of "Ask about this document" over the synthetic documents
 * (PRD FR-08, sections 5, 8 and 12) with the mock provider: for every golden
 * question the pipeline must read the clause that answers it and answer
 * from what it read, and for a question the document has no words for it
 * must refuse before any model call. The mock quotes whatever it is given,
 * so what is pinned here is the pipeline's own work - which paragraphs are
 * read, that no heading is among them, that every statement quotes a
 * returned passage word for word, that the counts and the refusal shape
 * hold - not the wording of an answer. The live-model eval
 * (tests/eval/ask.eval.ts) runs the same table against the configured
 * model, including the questions the document is on the subject of but
 * does not settle.
 */

const root = new URL("../../", import.meta.url);
const MOCK_MARKER = "Demo output (mock model, not analysis): ";

function loadChunks(file: string) {
  return splitParagraphs(readFileSync(new URL(`samples/${file}`, root), "utf8")).map((text, index) => ({
    id: `p${index + 1}`,
    text,
    location: { page: null, paragraph: index + 1, clause: detectClauseLabel(text)?.label ?? null },
  }));
}

/** The real mock behind a counter, so a refusal can be shown to have cost no call. */
function countedMock(): { provider: LlmProvider; calls: () => number } {
  const inner = createLlmProvider({ provider: "mock", model: "mock", apiKey: undefined, baseUrl: undefined } as never);
  let calls = 0;
  return {
    calls: () => calls,
    provider: {
      name: "mock",
      complete(request, signal) {
        calls += 1;
        return inner.complete(request, signal);
      },
    },
  };
}

function expectGrounded(answer: Answer) {
  const byId = new Map(answer.passages.map((passage) => [passage.id, passage]));
  for (const claim of answer.claims) {
    const cited = claim.source_chunk_ids.map((id) => byId.get(id));
    expect(cited.every(Boolean), "every citation points at a returned passage").toBe(true);
    expect(cited.some((passage) => passage!.text.includes(claim.quote)), "the quote is in a cited passage, word for word").toBe(true);
    expect(claim.text.startsWith(MOCK_MARKER)).toBe(true);
    expect(claim.location).toEqual(cited[0]!.location);
  }
}

for (const fixture of GOLDEN_QUESTIONS) {
  describe(`${fixture.id}: questions ${fixture.reader} asks`, () => {
    const chunks = loadChunks(fixture.file);

    it("reads the clause that answers each golden question and answers from what it read", async () => {
      const { provider } = countedMock();
      for (const [question, clause] of fixture.answered) {
        const answer = await askDocument(chunks, question, { provider, model: "mock" });
        const read = answer.passages.map((passage) => passage.location.clause ?? `p${passage.location.paragraph}`);
        expect(answer.status, `"${question}"`).toBe("answered");
        expect(read, `"${question}" read ${read.join(", ")}`).toContain(clause);
        expect(answer.passages.length).toBeLessThanOrEqual(5);
        for (const passage of answer.passages) expect(passage.text, "a heading is never read").not.toMatch(/^\d+\. [A-Z ]+$/);
        expect(answer.claims.length).toBeGreaterThan(0);
        expect(answer.claims.length).toBeLessThanOrEqual(3);
        expect(answer.reason).toBeNull();
        expect(answer.suggestedQuestion).toBeNull();
        expectGrounded(answer);
      }
    });

    it("answers with one statement under a close deadline", async () => {
      const { provider } = countedMock();
      const [question] = fixture.answered[0]!;
      const answer = await askDocument(chunks, question, { provider, model: "mock", style: "brief" });
      expect(answer.status).toBe("answered");
      expect(answer.style).toBe("brief");
      expect(answer.claims).toHaveLength(1);
      expectGrounded(answer);
    });

    it("refuses a question the document has no words for, before any model call, and hands it back", async () => {
      const { provider, calls } = countedMock();
      for (const question of fixture.outside.noWords) {
        const answer = await askDocument(chunks, `  ${question}  `, { provider, model: "mock" });
        expect(answer, `"${question}"`).toMatchObject({
          status: "not-in-document",
          reason: "no-evidence",
          suggestedQuestion: `${question}?`,
          claims: [],
          passages: [],
          withheld: 0,
        });
      }
      expect(calls()).toBe(0);
    });
  });
}
