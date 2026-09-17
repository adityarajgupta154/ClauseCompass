import { describe, expect, it } from "vitest";
import type {
  DocumentMapResponse,
  GroundedClaim,
  ReviewPrompt,
  ReviewPromptsResponse,
  SourceChunk,
} from "@workspace/api-client-react";
import { copy } from "@/features/journey/copy";
import { buildPacket, formatReferences, type Packet, type PacketItem } from "./build-packet";
import { renderPacketText } from "./render-text";

/**
 * The packet model over hand-made responses: one number per paragraph
 * however many statements rest on it, the same withholding as the screens,
 * every state of a map field, the checklist's derivation, and a text
 * rendering that carries every string of the model.
 */

const chunks: SourceChunk[] = [
  { id: "p3", text: "1.1 The Licensor is Asha Verma and the Licensee is Rohit Sen.", location: { page: null, paragraph: 3, clause: "1.1" } },
  { id: "p7", text: "3.1 The Licensee has paid a security deposit of Rs. 54,000/-, refundable within 30 days of vacating.", location: { page: null, paragraph: 7, clause: "3.1" } },
  { id: "p9", text: "4.1 The first six months, from 1 March 2026 to 31 August 2026, shall be a lock-in period.", location: { page: 2, paragraph: 9, clause: "4.1" } },
  { id: "p12", text: "6.2 Signed at Pune on 24/02/2026.", location: { page: 2, paragraph: 12, clause: "6.2" } },
];

const claim = (text: string, id: string, category: string, extra: Partial<GroundedClaim> = {}): GroundedClaim => {
  const chunk = chunks.find((candidate) => candidate.id === id)!;
  return { text, quote: chunk.text.slice(0, 40), source_chunk_ids: [id], location: chunk.location, confidence: 0.9, category, ...extra };
};

const map: DocumentMapResponse = {
  document: { kind: "txt", pageCount: null, wordCount: 120, paragraphCount: chunks.length },
  chunks,
  map: {
    fields: [
      { id: "parties", status: "found", claims: [claim("Asha Verma lets the flat to Rohit Sen.", "p3", "parties")], evidence: ["p3"], withheld: 0, reason: null },
      { id: "dates", status: "found", claims: [claim("The lock-in runs for the first six months.", "p9", "lock-in")], evidence: ["p9"], withheld: 0, reason: null },
      {
        id: "money",
        status: "found",
        claims: [
          claim("The deposit is Rs. 54,000 and comes back within 30 days.", "p7", "deposit"),
          // A statement the screens withhold: its citation points nowhere.
          claim("An unverifiable statement.", "p7", "deposit", { source_chunk_ids: ["p99"] }),
          claim("A weakly supported statement.", "p7", "penalty", { confidence: 0.3 }),
        ],
        evidence: ["p7"],
        withheld: 2,
        reason: null,
      },
      { id: "duties", status: "wording-only", claims: [claim("6.2 Signed at Pune on 24/02/2026.", "p12", "restriction")], evidence: ["p12"], withheld: 0, reason: "model-unavailable" },
      { id: "termination", status: "not-found", claims: [], evidence: [], withheld: 0, reason: null },
      { id: "dispute", status: "not-found", claims: [], evidence: [], withheld: 0, reason: null },
    ],
  },
  timeline: {
    items: [
      {
        date: "2026-02-24",
        asWritten: "24/02/2026",
        ambiguity: { kinds: ["day-month-order"], alternative: "2026-12-02" },
        topics: [],
        claim: claim("6.2 Signed at Pune on 24/02/2026.", "p12", "date"),
      },
      { date: "2026-03-01", asWritten: "1 March 2026", ambiguity: null, topics: ["Lock-in period"], claim: claim("The lock-in starts on 1 March 2026.", "p9", "date") },
    ],
  },
};

const prompt = (ruleId: string, family: ReviewPrompt["family"], relevance: ReviewPrompt["relevance"], placeIds: string[], extra: Partial<ReviewPrompt> = {}): ReviewPrompt => ({
  ruleId,
  family,
  category: ruleId.split(".")[1]!,
  title: `Rule ${ruleId}`,
  whyItMatters: `Why ${ruleId} matters.`,
  relevance,
  prompt: claim(`Check the wording for ${ruleId}.`, placeIds[0]!, ruleId.split(".")[1]!),
  phrasedBy: "model",
  reason: null,
  places: placeIds.map((id) => claim(chunks.find((chunk) => chunk.id === id)!.text, id, ruleId.split(".")[1]!)),
  ...extra,
});

const review: ReviewPromptsResponse = {
  document: map.document,
  chunks,
  registryVersion: "2026.09.1",
  stage: "before-signing",
  prompts: [
    prompt("money.deposit", "money", "primary", ["p7"]),
    prompt("exit.lock-in", "exit", "primary", ["p9", "p7"], { phrasedBy: "template", reason: "not-asked" }),
    prompt("time.term", "time", "secondary", ["p9"], { prompt: claim("Withheld question.", "p9", "term", { source_chunk_ids: [] }) }),
  ],
  notFound: [{ ruleId: "exit.notice", family: "exit", category: "notice", title: "Notice period" }],
  withheld: 1,
};

const preparedAt = new Date(Date.UTC(2026, 8, 15, 9, 0, 0));

function build(overrides: Partial<Parameters<typeof buildPacket>[0]> = {}): Packet {
  return buildPacket({ stage: "before-signing", fileName: "rental.txt", map, review, preparedAt, ...overrides });
}

const section = (packet: Packet, id: Packet["sections"][number]["id"]) => packet.sections.find((candidate) => candidate.id === id)!;
const items = (packet: Packet, id: Packet["sections"][number]["id"]) => section(packet, id).groups.flatMap((group) => group.items);
const ofKind = <K extends PacketItem["kind"]>(list: PacketItem[], kind: K) => list.filter((item): item is Extract<PacketItem, { kind: K }> => item.kind === kind);

describe("buildPacket", () => {
  it("lays out the five sections in the PRD's order with the boundary at the top and the bottom", () => {
    const packet = build();
    expect(packet.sections.map((candidate) => candidate.id)).toEqual(["summary", "dates", "questions", "evidence", "citations"]);
    expect(packet.notice).toBe(copy.packet.document.notice);
    expect(packet.disclaimer.title).toBe(copy.boundary.title);
    expect(packet.disclaimer.points).toEqual(copy.boundary.points);
    expect(packet.about).toEqual([
      "Document: rental.txt (TXT · 4 paragraphs)",
      "Situation: Before signing",
      expect.stringMatching(/^Prepared on \d{1,2} September 2026$/),
    ]);
  });

  it("numbers each paragraph once, in order of first use, and lists it once with its exact wording", () => {
    const packet = build();
    const citations = ofKind(items(packet, "citations"), "citation");
    expect(citations.map((citation) => citation.number)).toEqual([1, 2, 3, 4]);
    // Parties (p3), then the lock-in statement (p9), the deposit (p7), the signing date (p12).
    expect(citations.map((citation) => citation.text)).toEqual([chunks[0].text, chunks[2].text, chunks[1].text, chunks[3].text]);
    expect(citations.map((citation) => citation.location)).toEqual(["Clause 1.1 · Paragraph 3", "Clause 4.1 · Page 2, paragraph 9", "Clause 3.1 · Paragraph 7", "Clause 6.2 · Page 2, paragraph 12"]);

    // The same paragraph keeps its number wherever it is cited again.
    const questions = ofKind(items(packet, "questions"), "question");
    expect(questions[0].citations).toEqual([3]);
    expect(questions[1].places).toEqual([2, 3]);
    const used = new Set(
      packet.sections.flatMap((candidate) =>
        candidate.groups.flatMap((group) =>
          group.items.flatMap((item) => ("citations" in item ? item.citations : [])).concat(group.items.flatMap((item) => (item.kind === "question" ? item.places : []))),
        ),
      ),
    );
    expect([...used].sort()).toEqual([1, 2, 3, 4]);
  });

  it("numbers a question's own passage before its places when the question rests on a later place", () => {
    // Nothing in the summary or the dates, so the first numbers are handed out by the questions.
    const emptyMap: DocumentMapResponse = {
      ...map,
      map: { fields: map.map.fields.map((field) => ({ ...field, status: "not-found" as const, claims: [], evidence: [], withheld: 0, reason: null })) },
      timeline: { items: [] },
    };
    // The question is grounded in the second selected place (p7), yet it is read before the "Found at" line.
    const grounded = prompt("exit.lock-in", "exit", "primary", ["p9", "p7"], {
      prompt: claim("Check how the lock-in and the deposit interact.", "p7", "lock-in"),
    });
    const packet = build({ map: emptyMap, review: { ...review, prompts: [grounded], notFound: [], withheld: 0 } });
    const [question] = ofKind(items(packet, "questions"), "question");
    expect(question.citations).toEqual([1]);
    expect(question.places).toEqual([1, 2]);
    const citations = ofKind(items(packet, "citations"), "citation");
    expect(citations.map((citation) => [citation.number, citation.text])).toEqual([
      [1, chunks[1].text],
      [2, chunks[2].text],
    ]);
  });

  it("carries every state of a map field and withholds what the screens withhold", () => {
    const packet = build();
    const summary = section(packet, "summary");
    expect(summary.groups.map((group) => group.heading)).toEqual(Object.values(copy.map.fields).map((field) => field.title));

    const money = summary.groups.find((group) => group.id === "field-money")!;
    expect(money.items.map((item) => item.kind)).toEqual(["statement", "note", "statement"]);
    expect(money.items[0]).toMatchObject({ topic: "Deposit", text: "The deposit is Rs. 54,000 and comes back within 30 days.", citations: [3], note: null });
    expect(money.items[1]).toMatchObject({ kind: "note", topic: "Deposit", text: expect.stringContaining(copy.sourceCard.fallback.title) });
    expect(money.items[2]).toMatchObject({ topic: "Late fee or penalty", note: copy.sourceCard.lowConfidence });
    expect(money.footnote).toBe(copy.map.withheld(2));

    const duties = summary.groups.find((group) => group.id === "field-duties")!;
    expect(duties.items[0]).toMatchObject({ kind: "note", text: expect.stringContaining(copy.map.wordingOnly.title) });
    expect(duties.items[1]).toMatchObject({ kind: "statement", text: chunks[3].text });

    const termination = summary.groups.find((group) => group.id === "field-termination")!;
    expect(termination.items).toEqual([{ kind: "note", topic: null, text: `${copy.map.notFound.title}. ${copy.map.notFound.body(copy.map.fields.termination.missing)}` }]);
  });

  it("groups the dates by day and keeps an uncertain date's other reading", () => {
    const packet = build();
    const dates = section(packet, "dates");
    expect(dates.groups.map((group) => group.heading)).toEqual(["24 February 2026", "1 March 2026"]);
    expect(dates.groups[0].items[0]).toMatchObject({
      kind: "statement",
      topic: "Date",
      note: expect.stringContaining("Could also mean 2 December 2026"),
    });
    expect(dates.groups[1].items[0]).toMatchObject({ topic: "Lock-in period", citations: [2] });
  });

  it("says when there are no dates and no prompts instead of leaving the section empty", () => {
    const packet = build({
      map: { ...map, timeline: { items: [] } },
      review: { ...review, prompts: [], notFound: [], withheld: 0 },
    });
    expect(items(packet, "dates")).toEqual([{ kind: "note", topic: null, text: `${copy.timeline.empty.title}. ${copy.timeline.empty.body}` }]);
    expect(section(packet, "questions").groups.map((group) => group.heading)).toEqual([copy.review.empty.title]);
    // Only the fixed lines remain on the checklist.
    expect(ofKind(items(packet, "evidence"), "check").map((item) => item.text)).toEqual([
      ...copy.packet.sections.evidence.always,
      ...copy.packet.sections.evidence.stage["before-signing"],
    ]);
  });

  it("writes the questions in the review's groups, marks template and withheld prompts, and lists what was not found", () => {
    const packet = build();
    const questions = section(packet, "questions");
    expect(questions.groups.map((group) => group.heading)).toEqual([
      copy.review.groups.primary.title,
      copy.review.groups.secondary.title,
      copy.review.notFound.title,
    ]);
    const [deposit, lockIn] = ofKind(questions.groups[0].items, "question");
    expect(deposit).toMatchObject({ family: "Money", title: "Rule money.deposit", question: "Check the wording for money.deposit.", withheld: false, places: [3], note: null });
    expect(lockIn.note).toBe(`${copy.review.card.template.title}. ${copy.review.card.template.reasons["not-asked"]}`);
    const [term] = ofKind(questions.groups[1].items, "question");
    expect(term).toMatchObject({ withheld: true, citations: [], question: expect.stringContaining(copy.sourceCard.fallback.reasons["no-citations"]) });
    expect(questions.notes).toEqual([copy.review.withheld(1)]);
    expect(questions.groups[2].items).toEqual([{ kind: "note", topic: "Ending and disputes", text: "Notice period" }]);
  });

  it("derives the checklist from the moment and the families found, each line pointing at that family's places", () => {
    const packet = build();
    const checks = ofKind(items(packet, "evidence"), "check");
    const words = copy.packet.sections.evidence;
    expect(checks.map((check) => check.text)).toEqual([...words.always, ...words.stage["before-signing"], words.family.money, words.family.time, words.family.exit]);
    expect(checks.map((check) => check.citations)).toEqual([[], [], [], [3], [2], [2, 3]]);

    const problem = build({ stage: "problem-started" });
    expect(ofKind(items(problem, "evidence"), "check").map((check) => check.text)).toContain(words.stage["problem-started"][0]);
    expect(problem.about).toContain("Situation: A problem started");

    const compare = build({ stage: "compare-versions", fileName: "v2.txt" });
    expect(compare.about[1]).toBe(copy.packet.document.newerVersion("v2.txt"));
  });
});

describe("renderPacketText", () => {
  it("carries every sentence of the model and every reference number, with no markup", () => {
    const packet = build();
    const text = renderPacketText(packet);
    const strings: string[] = [packet.title, packet.subtitle, packet.notice, ...packet.about, packet.disclaimer.title, ...packet.disclaimer.points, packet.disclaimer.closing];
    for (const candidate of packet.sections) {
      strings.push(candidate.heading, candidate.lead, ...candidate.notes);
      for (const group of candidate.groups) {
        if (group.heading) strings.push(group.heading);
        if (group.note) strings.push(group.note);
        if (group.footnote) strings.push(group.footnote);
        for (const item of group.items) {
          if (item.kind === "question") strings.push(item.title, item.why, item.question, item.family);
          else if (item.kind === "citation") strings.push(item.location, item.text);
          else strings.push(item.text);
          if ("note" in item && item.note) strings.push(item.note);
          if ("topic" in item && item.topic) strings.push(item.topic);
        }
      }
    }
    for (const expected of strings) expect(text).toContain(expected);
    expect(text).toContain("Preparation packet\n==================");
    expect(text).toContain("[ ] The complete document");
    expect(text).toContain(`Found at ${formatReferences([2, 3])}.`);
    expect(text).toMatch(/\n\[3\] Clause 3\.1 · Paragraph 7\n {4}3\.1 The Licensee has paid/);
    expect(text).not.toMatch(/<\/?[a-z]/i);
    expect(text.endsWith("\n")).toBe(true);
  });
});
