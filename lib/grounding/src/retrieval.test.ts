import { describe, expect, it } from "vitest";
import { BM25_DEFAULTS, RETRIEVE_DEFAULTS, analyzeQuery, buildIndex, retrieve } from "./retrieval";

interface Chunk {
  id: string;
  text: string;
  location: { page: number | null; paragraph: number; clause: string | null };
}

const chunk = (paragraph: number, text: string, clause: string | null = null): Chunk => ({
  id: `c${paragraph}`,
  text,
  location: { page: null, paragraph, clause },
});

const CHUNKS: readonly Chunk[] = [
  chunk(1, "4. LOCK-IN PERIOD AND TERMINATION"),
  chunk(
    2,
    "4.2 After the lock-in period, either party may terminate this Agreement by giving one month's prior written notice.",
    "4.2",
  ),
  chunk(
    3,
    "5.4 The Licensee shall not keep pets in the Licensed Premises without the written consent of the Licensor.",
    "5.4",
  ),
  chunk(
    4,
    "3.2 The security deposit shall be refunded within thirty (30) days of the Licensee vacating the premises.",
    "3.2",
  ),
  chunk(
    5,
    "11.1 Any notice under this Agreement shall be in writing and delivered by hand or by registered post.",
    "11.1",
  ),
  chunk(6, "9.1 You will not provide services to any business that competes directly with the Company.", "9.1"),
];

const index = buildIndex(CHUNKS);

describe("buildIndex", () => {
  it("indexes every non-heading chunk and keeps positions aligned with the input", () => {
    expect(index.chunks).toBe(CHUNKS);
    expect(index.indexedCount).toBe(5);
    expect(index.lengths).toHaveLength(6);
    expect(index.lengths[0]).toBe(0);
    expect(index.averageLength).toBeGreaterThan(10);
    expect(index.options).toEqual(BM25_DEFAULTS);
    expect(index.postings.get("notic")?.map((p) => p.chunk)).toEqual([1, 4]);
  });

  it("lets the caller decide what to exclude", () => {
    expect(buildIndex(CHUNKS, { exclude: () => false }).indexedCount).toBe(6);
    expect(buildIndex(CHUNKS, { exclude: (c) => c.location.clause === null }).indexedCount).toBe(5);
    expect(buildIndex(CHUNKS, { k1: 2, b: 0.5 }).options).toEqual({ k1: 2, b: 0.5 });
  });

  it("copes with nothing to index", () => {
    expect(retrieve(buildIndex([]), "notice")).toEqual([]);
    expect(retrieve(buildIndex([chunk(1, "HEADING ONLY")]), "heading")).toEqual([]);
    expect(retrieve(buildIndex([chunk(1, "   ")]), "anything")).toEqual([]);
  });
});

describe("retrieve", () => {
  it("returns the indexed objects themselves, metadata intact, ranked and scored", () => {
    const hits = retrieve(index, "what is the notice period", { limit: 3 });
    expect(hits[0]!.chunk).toBe(CHUNKS[1]);
    expect(hits[0]!.chunk.location).toEqual({ page: null, paragraph: 2, clause: "4.2" });
    expect(hits.map((h) => h.rank)).toEqual([1, 2]);
    expect(hits[0]!.position).toBe(1);
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
    expect(hits[0]!.matchedTerms).toEqual(["notice", "period"]);
    expect(hits[1]!.matchedTerms).toEqual(["notice"]);
    for (const hit of hits) expect(hit.score).toBeGreaterThan(0);
  });

  it("never ranks a heading, even when it is the best lexical match", () => {
    const hits = retrieve(index, "lock-in termination");
    expect(hits.map((h) => h.chunk.id)).toEqual(["c2"]);
  });

  it("prefers the chunk that matches more of the query, then the rarer term", () => {
    expect(retrieve(index, "deposit refunded vacating")[0]!.chunk.id).toBe("c4");
    // "notice" is in two chunks, "pets" in one: the rarer word scores higher on its own.
    const [pets] = retrieve(index, "pets");
    const [notice] = retrieve(index, "notice");
    expect(pets!.score).toBeGreaterThan(notice!.score);
  });

  it("breaks ties by document order and honours the limit", () => {
    const twins = buildIndex([chunk(1, "written notice today", "1"), chunk(2, "written notice today", "2")]);
    expect(retrieve(twins, "notice").map((h) => h.chunk.id)).toEqual(["c1", "c2"]);
    expect(retrieve(twins, "notice", { limit: 1 }).map((h) => h.chunk.id)).toEqual(["c1"]);
    expect(retrieve(twins, "notice", { limit: 0 })).toEqual([]);
    expect(RETRIEVE_DEFAULTS.limit).toBe(5);
    expect(retrieve(index, "notice period deposit pets business premises")).toHaveLength(5);
  });

  it("returns nothing for a query with no content words or no overlap", () => {
    expect(retrieve(index, "what is this?")).toEqual([]);
    expect(retrieve(index, "kya hai ye")).toEqual([]);
    expect(retrieve(index, "helicopter insurance")).toEqual([]);
    expect(retrieve(index, "")).toEqual([]);
  });

  it("still returns a chunk whose only match is a term found in every chunk", () => {
    const all = buildIndex([chunk(1, "Licensee pays", "1"), chunk(2, "Licensee vacates", "2")]);
    expect(retrieve(all, "licensee").map((h) => h.chunk.id)).toEqual(["c1", "c2"]);
  });

  it("matches inflections and spellings through the same terms", () => {
    expect(retrieve(index, "terminating with notices")[0]!.chunk.id).toBe("c2");
    expect(retrieve(index, "refund of deposits")[0]!.chunk.id).toBe("c4");
    expect(retrieve(index, "license consent for pets")[0]!.chunk.id).toBe("c3");
  });

  it("is deterministic", () => {
    const a = retrieve(index, "deposit back", { limit: 3 });
    const b = retrieve(buildIndex([...CHUNKS]), "deposit back", { limit: 3 });
    expect(a).toEqual(b);
  });
});

describe("query expansion", () => {
  it("finds the contract's word for the reader's word, at half weight when the reader's word also occurs", () => {
    // "landlord" is nowhere in the text; "licensor" is.
    const [hit] = retrieve(index, "landlord consent");
    expect(hit!.chunk.id).toBe("c3");
    expect(hit!.matchedTerms).toEqual(["landlord", "consent"]);
    const terms = analyzeQuery("landlord consent");
    expect(terms).toContainEqual({ term: "licensor", surface: "landlord", weight: 0.5, origin: "synonym" });
    expect(terms).toContainEqual({ term: "consent", surface: "consent", weight: 1, origin: "query" });
  });

  it("scores an expansion at full weight when the typed word is absent from the document", () => {
    const synonyms = { competitor: ["competes"], quit: ["notice"] };
    // "competitor" never occurs; "competes" does. The expansion must be as good as typing "competes".
    const viaSynonym = retrieve(index, "competitor", { synonyms })[0]!;
    const direct = retrieve(index, "competes")[0]!;
    expect(viaSynonym.chunk.id).toBe("c6");
    expect(viaSynonym.score).toBeCloseTo(direct.score, 10);
    // "notice" occurs, so the "quit" → "notice" expansion stays at half weight.
    const quit = retrieve(index, "quit notice", { synonyms })[0]!;
    const notice = retrieve(index, "notice")[0]!;
    expect(quit.score).toBeCloseTo(notice.score, 10);
    const quitAlone = retrieve(index, "quit", { synonyms })[0]!;
    expect(quitAlone.chunk.id).toBe(notice.chunk.id);
    expect(quitAlone.score).toBeCloseTo(notice.score, 10);
  });

  it("keeps an expansion at half weight when the typed word occurs elsewhere in the document", () => {
    const corpus = buildIndex([
      chunk(1, "You may quit at any time.", "1"),
      chunk(2, "Written notice must be given.", "2"),
    ]);
    const synonyms = { quit: ["notice"] };
    const hits = retrieve(corpus, "quit", { synonyms });
    expect(hits.map((h) => h.chunk.id)).toEqual(["c1", "c2"]);
    const direct = retrieve(corpus, "notice")[0]!;
    expect(hits[1]!.score).toBeCloseTo(direct.score * 0.5, 10);
    expect(hits[1]!.matchedTerms).toEqual(["quit"]);
  });

  it("works for Hinglish and Devanagari words and either Unicode form of a key", () => {
    expect(retrieve(index, "deposit kab wapas milega")[0]!.chunk.id).toBe("c4");
    expect(retrieve(index, "जमा वापस कब मिलेगा")[0]!.chunk.id).toBe("c4");
    const composed = "तोड़".normalize("NFC");
    const decomposed = "तोड़".normalize("NFD");
    expect(analyzeQuery(composed).map((t) => t.term)).toEqual(analyzeQuery(decomposed).map((t) => t.term));
    expect(analyzeQuery(composed).some((t) => t.term === "termin")).toBe(true);
  });

  it("keeps the strongest weight when a typed word and an expansion share a term", () => {
    const terms = analyzeQuery("quit notice");
    expect(terms.filter((t) => t.term === "notic")).toEqual([
      { term: "notic", surface: "notice", weight: 1, origin: "query" },
    ]);
  });

  it("uses a custom table and weight when given", () => {
    const synonyms = { flat: ["premises"] };
    expect(analyzeQuery("flat", { synonyms, synonymWeight: 0.25 })).toEqual([
      { term: "flat", surface: "flat", weight: 1, origin: "query" },
      { term: "premis", surface: "flat", weight: 0.25, origin: "synonym" },
    ]);
    expect(analyzeQuery("landlord", { synonyms })).toEqual([
      { term: "landlord", surface: "landlord", weight: 1, origin: "query" },
    ]);
  });
});

describe("term-bag queries (task types)", () => {
  it("uses the bag as given, minus stopwords, and does not expand unless asked", () => {
    expect(analyzeQuery({ terms: ["notice period", "lock-in", "the deposit"] }).map((t) => t.term)).toEqual([
      "notic",
      "period",
      "lock",
      "deposit",
    ]);
    expect(analyzeQuery({ terms: ["landlord"] })).toHaveLength(1);
    expect(analyzeQuery({ terms: ["landlord"], expand: true }).some((t) => t.origin === "synonym")).toBe(true);
  });

  it("ranks the chunks a task needs", () => {
    const hits = retrieve(index, { terms: ["notice", "terminate", "days", "months"] }, { limit: 3 });
    // c4 matches only "days" and c5 only "notice"; "days" is the rarer term, so c4 comes first.
    expect(hits.map((h) => h.chunk.id)).toEqual(["c2", "c4", "c5"]);
    expect(hits[0]!.matchedTerms).toEqual(["notice", "terminate", "months"]);
  });
});
