import { describe, expect, it } from "vitest";
import { groundedClaimSchema, type SourceChunk } from "@workspace/grounding";
import { evaluateRules } from "@workspace/rules";
import { LlmError, type LlmRequest } from "../llm";
import { createMockProvider, demoOutput } from "../llm/mock";
import { splitParagraphs } from "../extraction/paragraphs";
import { toSourceChunks } from "./chunks";
import {
  buildDocumentMap,
  capEvidence,
  excerptOf,
  FIELD_SPECS,
  MAP_FIELD_IDS,
  MAX_EXCERPT_CHARS,
  MAX_FIELD_CHARS,
  MAX_FIELD_CHUNKS,
  selectEvidence,
  type MapField,
} from "./document-map";

/**
 * A small agreement with something for every field, so each field's
 * selection and each status can be driven deliberately.
 */
const AGREEMENT = `
LEAVE AND LICENCE AGREEMENT

This Agreement is made at Pune on 24th day of February 2026.

BETWEEN

Mr. Devraj Kulkarni, residing at Kothrud, Pune (hereinafter called the "LICENSOR") of the ONE PART;

AND

Mr. Imran Shaikh, residing at Wakad, Pune (hereinafter called the "LICENSEE") of the OTHER PART.

1. PERIOD

1.1 The Licensor grants the Licensee a licence for a period of eleven (11) months commencing on 1 March 2026 and ending on 31 January 2027.

2. LICENCE FEE

2.1 The Licensee shall pay to the Licensor a monthly licence fee of Rs. 18,000/- (Rupees Eighteen Thousand only) on or before the 5th day of each calendar month.

2.2 The Licensee has paid an interest-free refundable security deposit of Rs. 54,000/- which shall be refunded within thirty (30) days of vacating.

3. USE

3.1 The Licensee shall not sublet the premises or use them for any commercial purpose without the prior written consent of the Licensor.

4. TERMINATION

4.1 Either party may terminate this Agreement by giving one (1) month's prior written notice to the other party.

5. GOVERNING LAW

5.1 This Agreement shall be governed by the laws of India and the courts at Pune shall have exclusive jurisdiction over any dispute arising out of this Agreement.
`;

function chunksOf(text: string): SourceChunk[] {
  return toSourceChunks({
    chunks: splitParagraphs(text).map((paragraph, index) => ({ text: paragraph, page: null, paragraphIndex: index + 1 })),
  });
}

/** The field a request is about, read from the task line the pipeline wrote. */
function fieldOf(request: LlmRequest) {
  return FIELD_SPECS.find((spec) => request.user.includes(spec.task))?.id;
}

function byId(fields: MapField[]) {
  return Object.fromEntries(fields.map((field) => [field.id, field])) as Record<MapField["id"], MapField>;
}

const base = { model: "mock", stage: "before-signing" as const };

describe("buildDocumentMap", () => {
  const chunks = chunksOf(AGREEMENT);

  it("returns every field in a fixed order, found when the model's restatement verifies", async () => {
    const requests: LlmRequest[] = [];
    const provider = createMockProvider((request) => {
      requests.push(request);
      return demoOutput(request);
    });
    const { fields } = await buildDocumentMap(chunks, { ...base, provider });

    expect(fields.map((field) => field.id)).toEqual([...MAP_FIELD_IDS]);
    expect(fields.map((field) => field.status)).toEqual(Array(6).fill("found"));
    expect(requests.map(fieldOf).sort()).toEqual([...MAP_FIELD_IDS].sort());
    for (const field of fields) {
      expect(field.claims.length).toBeGreaterThan(0);
      expect(field.reason).toBeNull();
      for (const claim of field.claims) {
        expect(groundedClaimSchema.parse(claim)).toEqual(claim);
        expect(field.evidence).toEqual(expect.arrayContaining(claim.source_chunk_ids));
      }
    }
  });

  it("selects evidence per field from the rules and detectors, in document order", async () => {
    const provider = createMockProvider(demoOutput);
    const fields = byId((await buildDocumentMap(chunks, { ...base, provider })).fields);
    const text = (id: string) => chunks.find((chunk) => chunk.id === id)!.text;

    expect(fields.parties.evidence.map(text)).toEqual([expect.stringContaining("LICENSOR"), expect.stringContaining("LICENSEE")]);
    // Explicit dates, the term, and the two deadlines (payment day, refund window).
    expect(fields.dates.evidence.map(text)).toEqual([
      expect.stringContaining("24th day"),
      expect.stringContaining("1.1 "),
      expect.stringContaining("2.1 "),
      expect.stringContaining("2.2 "),
    ]);
    expect(fields.money.evidence.map(text)).toEqual([expect.stringContaining("2.1 "), expect.stringContaining("2.2 ")]);
    expect(fields.duties.evidence.map(text)).toEqual([expect.stringContaining("3.1 ")]);
    // The deposit's refund on vacating is part of how the arrangement ends (handover), as well as a money term.
    expect(fields.termination.evidence.map(text)).toEqual([expect.stringContaining("2.2 "), expect.stringContaining("4.1 ")]);
    expect(fields.dispute.evidence.map(text)).toEqual([expect.stringContaining("5.1 ")]);
  });

  it("only lets the model use each field's categories", async () => {
    const provider = createMockProvider(demoOutput);
    const fields = byId((await buildDocumentMap(chunks, { ...base, provider })).fields);
    for (const spec of FIELD_SPECS) {
      for (const claim of fields[spec.id].claims) expect(spec.categories).toContain(claim.category);
    }
  });

  it("marks a field not-found, without consulting the model, when the document has no such wording", async () => {
    const withoutDispute = chunksOf(AGREEMENT.replace(/5\. GOVERNING LAW[\s\S]*$/, ""));
    const asked: string[] = [];
    const provider = createMockProvider((request) => {
      asked.push(fieldOf(request) ?? "?");
      return demoOutput(request);
    });
    const fields = byId((await buildDocumentMap(withoutDispute, { ...base, provider })).fields);

    expect(fields.dispute).toEqual({ id: "dispute", status: "not-found", claims: [], evidence: [], withheld: 0, reason: null });
    expect(asked).not.toContain("dispute");
    expect(asked).toHaveLength(5);
    expect(fields.termination.status).toBe("found");
  });

  it("marks every field not-found on a document with nothing to map, and never calls the model", async () => {
    const provider = createMockProvider(() => {
      throw new Error("must not be called");
    });
    const { fields } = await buildDocumentMap(chunksOf("Dear Sir,\n\nThank you for your letter.\n\nRegards"), {
      ...base,
      provider,
    });
    expect(fields.map((field) => field.status)).toEqual(Array(6).fill("not-found"));
  });

  it("falls back to the document's own wording when the model is unavailable, naming the reason", async () => {
    const provider = createMockProvider((request) => {
      if (fieldOf(request) === "money") throw new LlmError("overloaded", "529 from provider", 529);
      return demoOutput(request);
    });
    const fields = byId((await buildDocumentMap(chunks, { ...base, provider })).fields);

    expect(fields.money.status).toBe("wording-only");
    expect(fields.money.reason).toBe("model-unavailable");
    expect(fields.money.claims).toHaveLength(2);
    for (const claim of fields.money.claims) {
      expect(groundedClaimSchema.parse(claim)).toEqual(claim);
      expect(claim.confidence).toBe(1);
      const cited = chunks.find((chunk) => chunk.id === claim.source_chunk_ids[0])!;
      expect(cited.text).toContain(claim.quote);
      expect(cited.text).toContain(claim.text.replace(/\u2026/g, ""));
    }
    expect(fields.money.claims.map((claim) => claim.category)).toEqual(["payment", "deposit"]);
    // The other fields are unaffected by one field's failure.
    expect(fields.termination.status).toBe("found");
  });

  it("falls back to the wording when nothing the model said could be verified", async () => {
    const provider = createMockProvider((request) => {
      if (fieldOf(request) !== "dispute") return demoOutput(request);
      // Cites a chunk that was never sent and quotes words that are not in the document.
      return {
        claims: [
          {
            text: "Disputes go to arbitration in Mumbai.",
            quote: "arbitration in Mumbai",
            source_chunk_ids: ["p99"],
            category: "dispute",
            confidence: 0.9,
          },
        ],
      };
    });
    const fields = byId((await buildDocumentMap(chunks, { ...base, provider })).fields);
    expect(fields.dispute.status).toBe("wording-only");
    expect(fields.dispute.reason).toBe("nothing-verified");
    expect(fields.dispute.claims).toHaveLength(1);
    expect(fields.dispute.claims[0]!.text).toContain("governed by the laws of India");
    expect(fields.dispute.claims[0]!.category).toBe("dispute");
  });

  it("propagates the caller's abort instead of reporting a state", async () => {
    const controller = new AbortController();
    const provider = createMockProvider((request) => {
      if (fieldOf(request) === "money") {
        controller.abort();
        throw new DOMException("aborted", "AbortError");
      }
      return demoOutput(request);
    });
    await expect(buildDocumentMap(chunks, { ...base, provider, signal: controller.signal })).rejects.toThrow();
  });
});

describe("evidence caps", () => {
  it("keeps at most MAX_FIELD_CHUNKS paragraphs per field, highest relevance first, then returns them in document order", () => {
    const many = chunksOf(
      Array.from({ length: 12 }, (_, i) => `${i + 1}.1 The Licensee shall pay a late fee of Rs. ${100 * (i + 1)} per day of delay.`).join("\n\n"),
    );
    const hits = evaluateRules(many, { stage: "before-signing" });
    const spec = FIELD_SPECS.find((entry) => entry.id === "money")!;
    const kept = capEvidence(selectEvidence(spec, many, hits));
    expect(kept).toHaveLength(MAX_FIELD_CHUNKS);
    const paragraphs = kept.map((item) => item.chunk.location.paragraph);
    expect(paragraphs).toEqual([...paragraphs].sort((x, y) => x - y));
  });

  it("skips a paragraph that would overflow the character cap and keeps shorter evidence after it", () => {
    const base = "The Licensee shall pay a late fee of Rs. 500 per day of delay.";
    const chunks = chunksOf([base, base, base, base, base].join("\n\n"));
    // Two long paragraphs: each is windowed to MAX_EXCERPT_CHARS, and the second would push the field past MAX_FIELD_CHARS.
    const long = (chunk: SourceChunk) => ({ ...chunk, text: `${base} ${"The premises shall be kept clean. ".repeat(250)}`.trim() });
    const evidence = [chunks[0]!, long(chunks[1]!), long(chunks[2]!), chunks[3]!, chunks[4]!].map((chunk) => ({
      chunk,
      match: { start: 0, end: base.length },
      category: "penalty",
    }));
    const kept = capEvidence(evidence);
    expect(kept.map((item) => item.chunk.id)).toEqual([chunks[0]!.id, chunks[1]!.id, chunks[3]!.id, chunks[4]!.id]);
    expect(kept.reduce((sum, item) => sum + excerptOf(item).text.length, 0)).toBeLessThanOrEqual(MAX_FIELD_CHARS);
  });

  it("shows a very long paragraph to the model as a window around its match, still verbatim", () => {
    const filler = "The premises shall be used for residential purposes only. ".repeat(120);
    const text = `${filler}The Licensee shall pay a late fee of Rs. 500 per day of delay. ${filler}`.trim();
    const [chunk] = chunksOf(text);
    const [hit] = evaluateRules([chunk!], { stage: "before-signing" }).filter((entry) => entry.ruleId === "money.late-fees");
    expect(hit).toBeDefined();
    const excerpt = excerptOf({ chunk: chunk!, match: { start: text.indexOf(hit!.matched), end: text.indexOf(hit!.matched) + hit!.matched.length }, category: "penalty" });
    expect(excerpt.id).toBe(chunk!.id);
    expect(excerpt.text.length).toBeLessThanOrEqual(MAX_EXCERPT_CHARS);
    expect(excerpt.text).toContain("late fee of Rs. 500");
    expect(text).toContain(excerpt.text);
  });
});
