import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SourceChunk } from "@workspace/grounding";
import { evaluateRules } from "@workspace/rules";
import { buildDocumentMap, buildTimeline, FIELD_SPECS, toSourceChunks, type MapField } from "../../artifacts/api-server/src/analysis";
import { splitParagraphs } from "../../artifacts/api-server/src/extraction/paragraphs";
import type { LlmRequest } from "../../artifacts/api-server/src/llm";
import { createMockProvider, demoOutput } from "../../artifacts/api-server/src/llm/mock";

/**
 * Golden run of the Document Map and Timeline over the synthetic documents
 * (PRD FR-04, FR-05, section 12). The deterministic layer is pinned here:
 * which paragraphs each field is built from, every explicit date, and the
 * "not found" state when a clause is deliberately removed. The model is the
 * mock, so what is pinned is selection and state, not wording.
 *
 * Any change to these lists is a change to what the product shows for
 * these documents and should be reviewed as one.
 */

const root = new URL("../../", import.meta.url);

function loadFixture(file: string): SourceChunk[] {
  const paragraphs = splitParagraphs(readFileSync(new URL(`samples/${file}`, root), "utf8"));
  return toSourceChunks({
    chunks: paragraphs.map((text, index) => ({ text, page: null, paragraphIndex: index + 1 })),
  });
}

const labelOf = (chunk: SourceChunk): string => chunk.location.clause ?? chunk.id;
const byId = (fields: MapField[]) => Object.fromEntries(fields.map((field) => [field.id, field])) as Record<MapField["id"], MapField>;

function evidenceLabels(chunks: SourceChunk[], field: MapField): string[] {
  return field.evidence.map((id) => labelOf(chunks.find((chunk) => chunk.id === id)!));
}

function fieldOf(request: LlmRequest) {
  return FIELD_SPECS.find((spec) => request.user.includes(spec.task))?.id;
}

async function mapOf(chunks: SourceChunk[], stage: "before-signing" | "problem-started" = "before-signing") {
  const asked: string[] = [];
  const provider = createMockProvider((request) => {
    asked.push(fieldOf(request) ?? "?");
    return demoOutput(request);
  });
  const { fields } = await buildDocumentMap(chunks, { stage, provider, model: "mock" });
  return { fields: byId(fields), asked };
}

const rental = loadFixture("rental-agreement-synthetic.txt");
const offer = loadFixture("offer-letter-synthetic.txt");
const nda = loadFixture("nda-synthetic.txt");

describe("rental agreement", () => {
  it("builds every field from the expected paragraphs", async () => {
    const { fields } = await mapOf(rental);
    const labels = (id: MapField["id"]) => evidenceLabels(rental, fields[id]);
    expect(Object.values(fields).map((field) => field.status)).toEqual(Array(6).fill("found"));
    expect(labels("parties")).toEqual(["p5", "p7"]);
    expect(labels("dates")).toEqual(["p3", "1.1", "1.2", "2.1", "2.2", "4.1"]);
    expect(labels("money")).toEqual(["2.1", "2.2", "2.3", "3.1", "3.2", "3.3"]);
    expect(labels("duties")).toEqual(["3.2", "5.1", "5.2", "5.3", "5.4", "10.1"]);
    expect(labels("termination")).toEqual(["3.2", "4.1", "4.2", "4.3", "9.1", "11.1"]);
    expect(labels("dispute")).toEqual(["12.1"]);
  });

  it("places every explicit date on the timeline with its paragraph and topics", () => {
    const items = buildTimeline(rental, evaluateRules(rental, { stage: "before-signing" }));
    expect(items.map((item) => [item.date, item.asWritten, labelOf(item.claim.source_chunk_ids.map((id) => rental.find((c) => c.id === id)!)[0]!)])).toEqual([
      ["2026-02-24", "24th day of February 2026", "p3"],
      ["2026-03-01", "1 March 2026", "1.1"],
      ["2026-03-01", "1 March 2026", "4.1"],
      ["2026-08-31", "31 August 2026", "4.1"],
      ["2027-01-31", "31 January 2027", "1.1"],
    ]);
    expect(items.every((item) => item.ambiguity === null)).toBe(true);
    expect(items.find((item) => item.date === "2026-08-31")!.topics).toContain("Lock-in or minimum period");
  });

  it("acceptance: with the governing-law clause removed, the dispute field is 'not found' and the model is never asked about it", async () => {
    const withoutGoverningLaw = rental.filter(
      (chunk) => !/^12\. GOVERNING LAW/.test(chunk.text) && !/^12\.1 /.test(chunk.text),
    );
    expect(withoutGoverningLaw).toHaveLength(rental.length - 2);

    const { fields, asked } = await mapOf(withoutGoverningLaw);
    expect(fields.dispute).toEqual({ id: "dispute", status: "not-found", claims: [], evidence: [], withheld: 0, reason: null });
    expect(asked).not.toContain("dispute");
    // The other five fields are untouched by the removal.
    expect(asked.sort()).toEqual(["dates", "duties", "money", "parties", "termination"]);
    expect(fields.termination.status).toBe("found");
    expect(evidenceLabels(withoutGoverningLaw, fields.termination)).toEqual(["3.2", "4.1", "4.2", "4.3", "9.1", "11.1"]);
  });

  it("labels an ambiguous numeric date instead of picking silently", () => {
    const withNumericDate: SourceChunk[] = [
      ...rental,
      {
        id: "p99",
        text: "The Licensee shall hand over vacant possession by 03/04/2027.",
        location: { page: null, paragraph: 99, clause: null },
      },
    ];
    const last = buildTimeline(withNumericDate).at(-1)!;
    expect(last).toMatchObject({
      date: "2027-04-03",
      asWritten: "03/04/2027",
      ambiguity: { kinds: ["day-month-order"], alternative: "2027-03-04" },
    });
    expect(last.claim.source_chunk_ids).toEqual(["p99"]);
  });
});

describe("offer letter", () => {
  it("builds every field from the expected paragraphs", async () => {
    const { fields } = await mapOf(offer);
    const labels = (id: MapField["id"]) => evidenceLabels(offer, fields[id]);
    expect(Object.values(fields).map((field) => field.status)).toEqual(Array(6).fill("found"));
    expect(labels("parties")).toEqual(["p4", "p7", "p50"]);
    expect(labels("dates")).toEqual(["p3", "2.1", "4.1", "6.2", "9.1", "13.1"]);
    expect(labels("money")).toEqual(["3.1", "3.2", "3.3", "6.1", "6.2", "p53"]);
    expect(labels("duties")).toEqual(["1.1", "1.2", "4.1", "5.1", "5.2", "7.1"]);
    expect(labels("termination")).toEqual(["4.2", "6.2", "7.1", "7.2", "7.3", "10.1"]);
    expect(labels("dispute")).toEqual(["12.1"]);
  });

  it("puts the letter date, the joining date and the offer deadline on the timeline, and leaves 'annually in April' off it", () => {
    const items = buildTimeline(offer, evaluateRules(offer, { stage: "before-signing" }));
    expect(items.map((item) => [item.date, item.asWritten])).toEqual([
      ["2026-09-12", "12 September 2026"],
      ["2026-09-25", "Friday, 25 September 2026"],
      ["2026-10-05", "Monday, 5 October 2026"],
    ]);
    expect(items.map((item) => item.claim.location.clause)).toEqual([null, "13.1", "2.1"]);
  });
});

describe("NDA", () => {
  it("builds every field from the expected paragraphs", async () => {
    const { fields } = await mapOf(nda);
    const labels = (id: MapField["id"]) => evidenceLabels(nda, fields[id]);
    expect(Object.values(fields).map((field) => field.status)).toEqual(Array(6).fill("found"));
    expect(labels("parties")).toEqual(["p5", "p7"]);
    expect(labels("dates")).toEqual(["p3", "2.4", "4.1", "4.2", "5.1", "p51"]);
    expect(labels("money")).toEqual(["9.2"]);
    expect(labels("duties")).toEqual(["2.1", "2.2", "3.2", "6.1", "10.2"]);
    expect(labels("termination")).toEqual(["4.1", "5.1", "10.5"]);
    expect(labels("dispute")).toEqual(["9.1", "9.2", "9.3"]);
  });

  it("puts the effective date and the signature date on the timeline as separate items", () => {
    const items = buildTimeline(nda);
    expect(items.map((item) => [item.date, item.claim.location.paragraph])).toEqual([
      ["2026-09-20", 3],
      ["2026-09-20", 51],
    ]);
  });
});
