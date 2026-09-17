import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type RetrievalHit, buildIndex, retrieve } from "@workspace/grounding";
import { detectClauseLabel } from "@workspace/rules";
import { splitParagraphs } from "../../artifacts/api-server/src/extraction/paragraphs";

/**
 * Golden run of lexical retrieval over the synthetic documents (PRD §7.1,
 * §12). Each question names the clause a reader would need, and that clause
 * must be in the top three hits. Paragraphs come from the same splitter the
 * extraction layer uses and are checked against samples/golden.json, so the
 * paragraph index on a hit is the one a citation would carry.
 *
 * Any question that starts to miss after a tokenizer, stopword or synonym
 * change is a real regression in what the reader is shown; fix the data, do
 * not loosen the expectation.
 */

const root = new URL("../../", import.meta.url);

interface GoldenDocument {
  paragraphCount: number;
  anchors: Array<{ paragraphIndex: number; startsWith: string }>;
}

const golden = JSON.parse(readFileSync(new URL("samples/golden.json", root), "utf8")) as Record<string, GoldenDocument>;

interface Paragraph {
  text: string;
  paragraphIndex: number;
}

function loadFixture(file: string, goldenKey: string): Paragraph[] {
  const paragraphs = splitParagraphs(readFileSync(new URL(`samples/${file}`, root), "utf8"));
  const expected = golden[goldenKey]!;
  expect(paragraphs.length, `${file}: paragraph count must match extraction's golden count`).toBe(
    expected.paragraphCount,
  );
  for (const anchor of expected.anchors) {
    expect(
      paragraphs[anchor.paragraphIndex - 1]!.startsWith(anchor.startsWith),
      `${file} p${anchor.paragraphIndex}`,
    ).toBe(true);
  }
  return paragraphs.map((text, index) => ({ text, paragraphIndex: index + 1 }));
}

const labelOf = (hit: RetrievalHit<Paragraph>): string =>
  detectClauseLabel(hit.chunk.text)?.label ?? `p${hit.chunk.paragraphIndex}`;

const TOP = 3;

/** [question, clause that answers it] — the clause must rank in the top three. */
type Expectation = [question: string, clause: string];

function expectAnswers(paragraphs: Paragraph[], expectations: Expectation[]): void {
  const index = buildIndex(paragraphs);
  for (const [question, clause] of expectations) {
    const hits = retrieve(index, question, { limit: TOP });
    const labels = hits.map(labelOf);
    expect(labels, `"${question}" → ${labels.join(", ")}`).toContain(clause);
    for (const hit of hits) {
      expect(hit.chunk, "a hit is the indexed paragraph itself, metadata intact").toBe(paragraphs[hit.position]);
      expect(hit.score).toBeGreaterThan(0);
      expect(hit.matchedTerms.length).toBeGreaterThan(0);
    }
  }
}

describe("rental agreement", () => {
  const paragraphs = loadFixture("rental-agreement-synthetic.txt", "rental-agreement");

  it("puts the notice clause in the top three for the acceptance question", () => {
    const hits = retrieve(buildIndex(paragraphs), "what is the notice period", { limit: TOP });
    expect(hits.map(labelOf)).toContain("4.2");
    expect(hits[0]!.chunk.text).toMatch(/one \(1\) month's prior written notice/);
    expect(hits[0]!.chunk.paragraphIndex).toBe(24);
    expect(hits[0]!.matchedTerms).toEqual(["notice", "period"]);
  });

  it("answers the questions a tenant asks, in English and Hinglish", () => {
    expectAnswers(paragraphs, [
      ["what is the notice period", "4.2"],
      ["notice period kitna hai", "4.2"],
      ["how much is the security deposit", "3.1"],
      ["when will I get my deposit back", "3.2"],
      ["deposit kab wapas milega", "3.2"],
      ["जमा वापस कब मिलेगा", "3.2"],
      ["kiraya kitna hai", "2.1"],
      ["किराया कितना है और कब देना है", "2.1"],
      ["can I keep a pet", "5.4"],
      ["can I break the lease early", "4.2"],
      ["kya main kiraya late de sakta hoon, jurmana kitna hai", "2.2"],
      ["who pays for repairs", "6.2"],
      ["landlord kab ghar mein aa sakta hai", "7.1"],
      ["how much will the rent increase on renewal", "1.2"],
      ["can my friend stay with me as a guest", "5.2"],
    ]);
  });

  it("serves a task's term bag as well as a question", () => {
    const hits = retrieve(buildIndex(paragraphs), { terms: ["notice", "terminate", "days", "months", "lock-in"] });
    expect(hits.slice(0, 3).map(labelOf)).toEqual(["4.2", "4.3", "4.1"]);
  });

  it("never returns a heading", () => {
    const hits = retrieve(buildIndex(paragraphs), "security deposit notices termination", { limit: 10 });
    for (const hit of hits) expect(hit.chunk.text).not.toMatch(/^\d+\. [A-Z ]+$/);
  });
});

describe("offer letter", () => {
  const paragraphs = loadFixture("offer-letter-synthetic.txt", "offer-letter");

  it("answers the questions a candidate asks", () => {
    expectAnswers(paragraphs, [
      ["what is the notice period", "7.1"],
      ["how long is probation", "4.1"],
      ["training bond kitna hai", "6.2"],
      ["can I work for a competitor after leaving", "9.1"],
      ["how many days of leave do I get", "5.2"],
      ["can they fire me without notice", "7.2"],
      ["kya bonus guaranteed hai", "3.2"],
      ["till when do I have to accept this offer", "13.1"],
    ]);
  });
});

describe("NDA", () => {
  const paragraphs = loadFixture("nda-synthetic.txt", "nda");

  it("answers the questions a receiving party asks", () => {
    expectAnswers(paragraphs, [
      ["how long does confidentiality last", "4.2"],
      ["which court handles disputes", "9.3"],
      ["what happens if I breach the nda", "8.2"],
      ["kya main unke clients ke saath kaam kar sakta hoon", "6.1"],
    ]);
  });
});
