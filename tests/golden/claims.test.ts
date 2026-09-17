import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildIndex, retrieve, type SourceChunk } from "@workspace/grounding";
import { detectClauseLabel } from "@workspace/rules";
import { splitParagraphs } from "../../artifacts/api-server/src/extraction/paragraphs";
import { generateClaims } from "../../artifacts/api-server/src/llm";
import { scriptedProvider } from "../../artifacts/api-server/src/testing/llm";

/**
 * Retrieval feeding the model call on a real fixture (PRD section 7.2 end to
 * end, minus the network): the top hits for a question become the excerpts,
 * a scripted "model" answers badly, and the result the UI would receive
 * contains only what the validator verified against those excerpts.
 */

const root = new URL("../../", import.meta.url);

function rentalChunks(): SourceChunk[] {
  const text = readFileSync(new URL("samples/rental-agreement-synthetic.txt", root), "utf8");
  return splitParagraphs(text).map((paragraph, index) => ({
    id: `p${index + 1}`,
    text: paragraph,
    location: { page: null, paragraph: index + 1, clause: detectClauseLabel(paragraph)?.label ?? null },
  }));
}

const question = "what is the notice period";
const categories = ["notice", "payment", "deposit"];

describe("claims over the rental fixture", () => {
  const chunks = rentalChunks();
  const excerpts = retrieve(buildIndex(chunks), question, { limit: 3 }).map((hit) => hit.chunk);
  const noticeChunk = excerpts.find((chunk) => chunk.location.clause === "4.2")!;

  it("sends only the retrieved excerpts, with their ids and locations", () => {
    expect(noticeChunk).toBeDefined();
    expect(excerpts.length).toBe(3);
  });

  it("a malformed reply (bad JSON) never becomes claims", async () => {
    const provider = scriptedProvider(['{"claims": [', "```json\n{}\n```"]);
    const result = await generateClaims(
      { task: "Answer the reader's question.", question, chunks: excerpts, categories, maxClaims: 3 },
      provider,
      {
        model: "scripted",
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid-output");
    expect(provider.requests).toHaveLength(2);
  });

  it("a reply citing a chunk that was not sent is rejected, and only the verified claim comes back", async () => {
    const good = {
      text: "Either side can end the agreement by giving one month's written notice.",
      quote: "one (1) month's prior written notice",
      source_chunk_ids: [noticeChunk.id],
      category: "notice",
      confidence: 0.92,
    };
    const invented = {
      text: "The deposit is forfeited if the tenant leaves early.",
      quote: "deposit shall stand forfeited",
      // A paragraph that exists in the document but was not among the excerpts sent.
      source_chunk_ids: ["p3"],
      category: "deposit",
      confidence: 0.8,
    };
    const provider = scriptedProvider([{ claims: [good, invented] }, { claims: [good, invented] }]);
    const result = await generateClaims(
      { task: "Answer the reader's question.", question, chunks: excerpts, categories, maxClaims: 3 },
      provider,
      {
        model: "scripted",
      },
    );
    expect(result).toMatchObject({ ok: true, attempts: 2, withheld: 1 });
    if (!result.ok) return;
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]).toMatchObject({
      source_chunk_ids: [noticeChunk.id],
      location: { paragraph: 24, clause: "4.2" },
      quote: "one (1) month's prior written notice",
    });
    expect(provider.requests[1]!.user).toContain('cites "p3", not among the excerpts');
  });

  it("a quote the cited paragraph does not contain is rejected even when the id is right", async () => {
    const misquoted = {
      text: "Notice must be given three months ahead.",
      quote: "three (3) months' prior written notice",
      source_chunk_ids: [noticeChunk.id],
      category: "notice",
      confidence: 0.9,
    };
    const provider = scriptedProvider([{ claims: [misquoted] }, { claims: [misquoted] }]);
    const result = await generateClaims(
      { task: "Answer the reader's question.", question, chunks: excerpts, categories, maxClaims: 3 },
      provider,
      {
        model: "scripted",
      },
    );
    expect(result).toMatchObject({ ok: true, claims: [], withheld: 1, attempts: 2 });
  });
});
