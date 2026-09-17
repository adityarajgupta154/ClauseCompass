import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { RULE_REGISTRY, type RuleHit, evaluateRules, summarizeFamilies } from "@workspace/rules";
import { splitParagraphs } from "../../artifacts/api-server/src/extraction/paragraphs";

/**
 * Golden run of the clause-rule registry over the synthetic documents
 * (PRD §12). The paragraphs are produced by the same splitter the extraction
 * layer uses, and checked against samples/golden.json, so a paragraph index
 * here is the paragraph index a citation would carry.
 *
 * Labels in the expectations are clause numbers ("4.2"); paragraphs without
 * a clause number are named by position ("p3"). Any change to these lists is
 * a deliberate change to what the product flags and should be reviewed as one.
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

type Hit = RuleHit<Paragraph>;

const labelOf = (hit: Hit): string => hit.clause?.label ?? `p${hit.chunk.paragraphIndex}`;
const labels = (hits: Hit[], ruleId: string): string[] => hits.filter((h) => h.ruleId === ruleId).map(labelOf);
const rulesAt = (hits: Hit[], label: string): string[] => hits.filter((h) => labelOf(h) === label).map((h) => h.ruleId);
const paragraphsHit = (hits: Hit[]): number[] =>
  [...new Set(hits.map((h) => h.chunk.paragraphIndex))].sort((a, b) => a - b);
const familyCount = (hits: Hit[], family: string): number =>
  summarizeFamilies(hits).find((s) => s.family === family)!.hitCount;

const RELEVANCE_RANK = { primary: 0, secondary: 1, background: 2 } as const;

function expectOrderedByRelevance(hits: Hit[]): void {
  const ranks = hits.map((h) => RELEVANCE_RANK[h.relevance!]);
  for (let i = 1; i < ranks.length; i++) expect(ranks[i]!).toBeGreaterThanOrEqual(ranks[i - 1]!);
}

// The rule engine must work with no network at all. The guard goes up before
// any evaluation below runs (they run while the file is collected).
const originalFetch = globalThis.fetch;
globalThis.fetch = (() => {
  throw new Error("rule evaluation must not touch the network");
}) as typeof fetch;
afterAll(() => {
  globalThis.fetch = originalFetch;
});

const nda = loadFixture("nda-synthetic.txt", "nda");
const rental = loadFixture("rental-agreement-synthetic.txt", "rental-agreement");
const offer = loadFixture("offer-letter-synthetic.txt", "offer-letter");

describe("NDA fixture", () => {
  const hits = evaluateRules(nda, { documentType: "nda" });

  it("flags Data & IP as the dominant family", () => {
    const [top] = summarizeFamilies(hits);
    expect(top!.family).toBe("data-ip");
    expect(top!.hitCount).toBeGreaterThanOrEqual(15);
    expect(familyCount(hits, "data-ip")).toBeGreaterThan(familyCount(hits, "exit"));
  });

  it("finds the confidentiality clauses and the IP / no-licence clause", () => {
    expect(labels(hits, "data-ip.confidentiality")).toEqual([
      "B",
      "1.1",
      "1.2",
      "1.3",
      "2.1",
      "2.2",
      "2.3",
      "2.4",
      "2.5",
      "3.1",
      "3.2",
      "4.2",
      "5.1",
      "6.1",
      "7.1",
      "8.2",
    ]);
    expect(labels(hits, "data-ip.ip")).toEqual(["7.1"]);
    expect(labels(hits, "data-ip.handling")).toEqual(["2.3", "5.1"]);
    expect(labels(hits, "data-ip.incident")).toEqual(["2.4", "2.5"]);
  });

  it("finds term, survival, notice, return and remedies", () => {
    expect(rulesAt(hits, "4.1")).toEqual(expect.arrayContaining(["time.term", "exit.notice", "exit.termination"]));
    expect(labels(hits, "time.survival")).toEqual(["4.2"]);
    expect(labels(hits, "exit.handover")).toEqual(["5.1"]);
    expect(labels(hits, "duty.non-solicit")).toEqual(["6.1"]);
    expect(labels(hits, "duty.one-way")).toEqual(["3.2"]);
    expect(labels(hits, "exit.remedies")).toEqual(["8.1", "8.2", "8.3"]);
    expect(labels(hits, "exit.disputes")).toEqual(["9.1", "9.2", "9.3"]);
    expect(labels(hits, "duty.one-sided")).toEqual(["10.2"]);
    expect(labels(hits, "exit.notice-service")).toEqual(["10.5"]);
  });

  it("captures the period and renders it into the review prompt", () => {
    const notice = hits.find((h) => h.ruleId === "exit.notice" && labelOf(h) === "4.1")!;
    expect(notice.captures).toEqual({ period: "thirty (30) days" });
    expect(notice.reviewPrompt).toBe(
      "Clause 4.1 sets the notice needed to end this (thirty (30) days). Check it is the same for both sides, and whether money can be paid instead of notice.",
    );
    expect(hits.find((h) => h.ruleId === "time.deadline" && labelOf(h) === "2.4")!.captures).toEqual({
      window: "twenty-four (24) hours",
    });
  });

  it("leaves headings, parties, boilerplate and signature blocks alone", () => {
    expect(paragraphsHit(hits)).toEqual([
      3, 11, 14, 15, 16, 18, 19, 20, 21, 22, 24, 25, 27, 28, 30, 32, 34, 36, 37, 38, 40, 41, 42, 45, 48, 51,
    ]);
    // p1 disclaimer, p2 title, p5/p7 parties, p44 entire agreement, p53 signature line
    for (const untouched of [1, 2, 4, 5, 6, 7, 8, 9, 10, 12, 13, 44, 46, 47, 49, 50, 52, 53]) {
      expect(paragraphsHit(hits)).not.toContain(untouched);
    }
  });

  it("orders hits by stage relevance", () => {
    for (const stage of ["before-signing", "problem-started", "compare-versions"] as const) {
      const staged = evaluateRules(nda, { documentType: "nda", stage });
      expect(staged.length).toBe(hits.length);
      expectOrderedByRelevance(staged);
      expect(staged[0]!.relevance).toBe("primary");
    }
    const before = evaluateRules(nda, {
      documentType: "nda",
      stage: "before-signing",
    });
    expect(before[0]!.ruleId).toBe("data-ip.confidentiality");
  });
});

describe("rental fixture", () => {
  const hits = evaluateRules(rental, { documentType: "rental" });

  it("flags the notice and termination clauses under Exit & remedies", () => {
    expect(rulesAt(hits, "4.2")).toEqual(expect.arrayContaining(["exit.notice", "exit.termination", "exit.lock-in"]));
    expect(rulesAt(hits, "4.3")).toEqual(expect.arrayContaining(["exit.notice", "exit.termination", "time.deadline"]));
    expect(labels(hits, "exit.notice")).toEqual(["4.2", "4.3"]);
    expect(labels(hits, "exit.termination")).toEqual(["4.2", "4.3"]);
    expect(labels(hits, "exit.lock-in")).toEqual(["4.1", "4.2"]);
    expect(familyCount(hits, "exit")).toBeGreaterThanOrEqual(10);
  });

  it("reads the notice periods", () => {
    const [ordinary, onDefault] = hits.filter((h) => h.ruleId === "exit.notice");
    expect(ordinary!.captures.period).toBe("one (1) month");
    expect(onDefault!.captures.period).toBe("fifteen (15) days");
    expect(ordinary!.reviewPrompt.startsWith("Clause 4.2 sets the notice needed to end this (one (1) month).")).toBe(
      true,
    );
  });

  it("finds the money clauses", () => {
    expect(labels(hits, "money.payment-terms")).toEqual(["2.1", "2.3"]);
    expect(labels(hits, "money.late-fees")).toEqual(["2.2"]);
    expect(labels(hits, "money.deposit")).toEqual(["3.1", "3.2", "3.3", "4.1"]);
    expect(labels(hits, "money.who-pays")).toEqual(["2.3", "3.2", "10.1"]);
  });

  it("finds term, renewal, deadlines and dates", () => {
    expect(labels(hits, "time.term")).toEqual(["1.1"]);
    expect(labels(hits, "time.renewal")).toEqual(["1.2"]);
    expect(labels(hits, "time.deadline")).toEqual(["1.2", "2.1", "2.2", "3.1", "3.2", "4.3", "7.1", "10.1"]);
    expect(labels(hits, "time.dated")).toEqual(["p3", "1.1", "4.1"]);
  });

  it("finds duties, hand-back, inspection, registration and disputes", () => {
    expect(labels(hits, "duty.restrictions")).toEqual(["5.1", "5.2", "5.3", "5.4", "7.1"]);
    expect(labels(hits, "duty.upkeep")).toEqual(["3.2", "6.1", "6.2", "9.1"]);
    expect(labels(hits, "duty.conditions")).toEqual(["10.1"]);
    expect(labels(hits, "exit.handover")).toEqual(["3.2", "4.1", "9.1"]);
    expect(labels(hits, "exit.remedies")).toEqual(["9.1"]);
    expect(labels(hits, "data-ip.monitoring")).toEqual(["7.1"]);
    expect(labels(hits, "exit.notice-service")).toEqual(["11.1"]);
    expect(labels(hits, "exit.disputes")).toEqual(["12.1"]);
  });

  it("leaves the schedule of fittings, witnesses and signatures alone", () => {
    expect(paragraphsHit(hits)).toEqual([
      3, 12, 13, 15, 16, 17, 19, 20, 21, 23, 24, 25, 27, 28, 29, 30, 33, 34, 36, 40, 42, 44, 47,
    ]);
    expect(rental[51]!.text.startsWith("SCHEDULE I")).toBe(true);
    expect(rental[52]!.text.startsWith("1. Two ceiling fans")).toBe(true);
    for (const untouched of [1, 2, 8, 9, 48, 49, 50, 51, 52, 53]) expect(paragraphsHit(hits)).not.toContain(untouched);
  });

  it("scopes document-type rules", () => {
    expect(labels(hits, "time.probation")).toEqual([]);
    const asNda = evaluateRules(rental, { documentType: "nda" });
    expect(labels(asNda, "duty.upkeep")).toEqual([]);
    expect(labels(asNda, "exit.notice")).toEqual(["4.2", "4.3"]);
    const unknownType = evaluateRules(rental);
    expect(labels(unknownType, "duty.upkeep")).toEqual(["3.2", "6.1", "6.2", "9.1"]);
  });
});

describe("offer-letter fixture", () => {
  const hits = evaluateRules(offer, { documentType: "offer_letter" });

  it("finds probation, notice and termination", () => {
    expect(labels(hits, "time.probation")).toEqual(["4.1", "4.2", "7.1"]);
    expect(labels(hits, "exit.notice")).toEqual(["4.2", "7.1", "7.2", "10.1"]);
    expect(labels(hits, "exit.termination")).toEqual(["4.2", "7.1", "7.2", "10.1"]);
    expect(hits.find((h) => h.ruleId === "exit.notice" && labelOf(h) === "7.1")!.captures.period).toBe(
      "sixty (60) days",
    );
    expect(labels(hits, "exit.handover")).toEqual(["7.3"]);
  });

  it("finds the money clauses, including the training bond", () => {
    expect(labels(hits, "money.payment-terms")).toEqual(["3.1", "p53"]);
    expect(labels(hits, "money.discretionary")).toEqual(["3.2", "3.3", "p54"]);
    expect(labels(hits, "money.bond-repayment")).toEqual(["6.1", "6.2"]);
    expect(labels(hits, "exit.lock-in")).toEqual(["6.2"]);
    expect(hits.find((h) => h.ruleId === "exit.lock-in")!.captures.period).toBe("eighteen (18) months");
  });

  it("finds the restrictive covenants, IP and data clauses", () => {
    expect(labels(hits, "duty.non-compete")).toEqual(["9.1"]);
    expect(labels(hits, "duty.non-solicit")).toEqual(["9.2"]);
    expect(labels(hits, "time.survival")).toEqual(["8.1", "9.1", "9.2"]);
    expect(labels(hits, "data-ip.confidentiality")).toEqual(["7.2", "8.1"]);
    expect(labels(hits, "data-ip.ip")).toEqual(["8.1", "8.2"]);
    expect(labels(hits, "data-ip.personal-data")).toEqual(["11.1"]);
    expect(labels(hits, "data-ip.monitoring")).toEqual(["11.2"]);
    expect(labels(hits, "duty.conditions")).toEqual(["10.1"]);
    expect(labels(hits, "exit.disputes")).toEqual(["12.1"]);
  });

  it("finds the working-hours and leave clause, but not the IP clause that mentions hours", () => {
    expect(labels(hits, "duty.hours")).toEqual(["5.1", "5.2"]);
  });

  it("finds one-sided discretion and dates", () => {
    expect(labels(hits, "duty.one-sided")).toEqual(["1.1", "1.2", "4.1", "5.2", "7.1", "13.2", "p54"]);
    expect(labels(hits, "time.dated")).toEqual(["p3", "2.1", "13.1"]);
    expect(labels(hits, "time.deadline")).toEqual(["2.1", "3.1", "7.3", "13.1"]);
  });

  it("leaves the closing, acceptance block and document checklist alone", () => {
    expect(paragraphsHit(hits)).toEqual([
      3, 9, 10, 12, 14, 15, 16, 18, 19, 21, 22, 24, 25, 27, 28, 29, 31, 32, 34, 35, 37, 39, 40, 42, 44, 45, 53, 54,
    ]);
    expect(offer[55]!.text.startsWith("1. Signed copy of this offer letter.")).toBe(true);
    for (const untouched of [1, 2, 4, 5, 6, 7, 46, 47, 48, 49, 50, 51, 52, 55, 56])
      expect(paragraphsHit(hits)).not.toContain(untouched);
  });
});

describe("registry coverage", () => {
  /** Rules for wording none of the three fixtures contains yet; each is exercised on a sentence below. */
  const NOT_IN_FIXTURES: Record<string, string[]> = {
    "exit.liability": [
      "9.4 Neither party shall be liable for any indirect or consequential loss, and the Licensor's total liability shall not exceed one month's licence fee.",
      "8.4 Limitation of liability: the Company will not be liable for loss of data arising from use of the software.",
    ],
  };

  it("fires every rule on at least one synthetic document, or on its listed example sentences", () => {
    const fired = new Set(
      [
        ...evaluateRules(nda, { documentType: "nda" }),
        ...evaluateRules(rental, { documentType: "rental" }),
        ...evaluateRules(offer, { documentType: "offer_letter" }),
      ].map((h) => h.ruleId),
    );
    const dead = RULE_REGISTRY.rules.map((r) => r.id).filter((id) => !fired.has(id));
    expect(dead).toEqual(Object.keys(NOT_IN_FIXTURES));
    for (const [ruleId, sentences] of Object.entries(NOT_IN_FIXTURES)) {
      for (const sentence of sentences) {
        expect(
          evaluateRules([{ text: sentence }]).map((h) => h.ruleId),
          sentence,
        ).toContain(ruleId);
      }
    }
  });

  it("handles a very long, repetitive paragraph in linear time", () => {
    const filler = "the licensee shall not " + "notice ".repeat(20) + "at the company’s discretion ";
    const long = filler.repeat(1500);
    const started = performance.now();
    const hits = evaluateRules([{ text: long }, { text: "a".repeat(200_000) }, { text: "the party x".repeat(20_000) }]);
    expect(performance.now() - started).toBeLessThan(2_000);
    expect(hits.map((h) => h.ruleId)).toEqual(["duty.restrictions", "duty.one-sided"]);
  });

  it("is deterministic", () => {
    const first = evaluateRules(rental, {
      documentType: "rental",
      stage: "problem-started",
    });
    const second = evaluateRules(rental, {
      documentType: "rental",
      stage: "problem-started",
    });
    expect(second).toEqual(first);
  });
});
