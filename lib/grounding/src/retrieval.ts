import { isHeading } from "./heading";
import { QUERY_SYNONYMS } from "./synonyms";
import { analyzeDocument, isStopword, normalizeText, termOf, tokenize } from "./tokenize";

/**
 * Lexical retrieval over document chunks (PRD section 7.1): Okapi BM25 over
 * the stemmed terms of each chunk, no embeddings, no vector store, nothing
 * loaded from disk. A single agreement has a few hundred paragraphs, so the
 * index is built per document in memory and a query is a walk over postings.
 *
 * The chunks handed in are returned as they were given — the same objects,
 * with whatever page/paragraph/clause metadata they carry — so a hit can be
 * cited without a second lookup. Results are deterministic: ties in score
 * fall back to document order.
 */

export interface Bm25Options {
  /** Term-frequency saturation; Okapi's usual 1.2. */
  k1?: number;
  /** Length normalisation, 0 (none) to 1 (full); Okapi's usual 0.75. */
  b?: number;
}

export interface IndexOptions<C extends { text: string }> extends Bm25Options {
  /**
   * Chunks that stay in `chunks` (positions are stable) but are never ranked.
   * By default section headings: they name a section, they never answer.
   */
  exclude?: (chunk: C) => boolean;
}

export const BM25_DEFAULTS: Readonly<Required<Bm25Options>> = Object.freeze({ k1: 1.2, b: 0.75 });

const excludeHeadings = (chunk: { text: string }): boolean => isHeading(chunk.text);

export interface Posting {
  /** Index of the chunk in the array the index was built from. */
  readonly chunk: number;
  /** Occurrences of the term in that chunk. */
  readonly tf: number;
}

export interface RetrievalIndex<C extends { text: string }> {
  readonly chunks: readonly C[];
  /** Number of index terms per chunk, aligned with `chunks`; 0 for excluded chunks. */
  readonly lengths: readonly number[];
  /** Chunks that take part in ranking (not excluded). */
  readonly indexedCount: number;
  /** Mean length over the indexed chunks. */
  readonly averageLength: number;
  readonly postings: ReadonlyMap<string, readonly Posting[]>;
  readonly options: Readonly<Required<Bm25Options>>;
}

/** Builds the BM25 index for one document's chunks. Chunks need only a `text`. */
export function buildIndex<C extends { text: string }>(
  chunks: readonly C[],
  { exclude = excludeHeadings, ...bm25 }: IndexOptions<C> = {},
): RetrievalIndex<C> {
  const postings = new Map<string, Posting[]>();
  const lengths: number[] = [];
  let indexedCount = 0;
  let total = 0;
  chunks.forEach((chunk, position) => {
    if (exclude(chunk)) {
      lengths.push(0);
      return;
    }
    const terms = analyzeDocument(chunk.text);
    lengths.push(terms.length);
    indexedCount += 1;
    total += terms.length;
    const counts = new Map<string, number>();
    for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1);
    for (const [term, tf] of counts) {
      let list = postings.get(term);
      if (!list) postings.set(term, (list = []));
      list.push({ chunk: position, tf });
    }
  });
  return {
    chunks,
    lengths,
    indexedCount,
    averageLength: indexedCount === 0 ? 0 : total / indexedCount,
    postings,
    options: { ...BM25_DEFAULTS, ...bm25 },
  };
}

/**
 * What to look for: a reader's question as typed, or a bag of terms that
 * describes a task (for example the words a timeline needs). Both lose their
 * stopwords; questions also gain lay/Hinglish expansions, term bags only when
 * asked (`expand: true`), since the caller chose every word.
 */
export type RetrievalQuery = string | { readonly terms: readonly string[]; readonly expand?: boolean };

export interface QueryTerm {
  /** Index term (stemmed) that is looked up. */
  readonly term: string;
  /** The word the reader typed (or the bag entry) that this term came from. */
  readonly surface: string;
  /**
   * 1 for typed words, `synonymWeight` for expansions. An expansion is scored
   * at 1 after all when the typed word itself occurs nowhere in the document:
   * then the expansion is the only way to honour that word.
   */
  readonly weight: number;
  readonly origin: "query" | "synonym";
}

export interface RetrieveOptions {
  /** Top-N to return. */
  limit?: number;
  /** Weight of synonym expansions relative to typed words that the document does contain. */
  synonymWeight?: number;
  /** Expansion table; defaults to the built-in lay/Hinglish one. */
  synonyms?: Readonly<Record<string, readonly string[]>>;
}

export const RETRIEVE_DEFAULTS: Readonly<Required<Omit<RetrieveOptions, "synonyms">>> = Object.freeze({
  limit: 5,
  synonymWeight: 0.5,
});

export interface RetrievalHit<C extends { text: string }> {
  /** The very object that was indexed, metadata and all. */
  readonly chunk: C;
  /** Position of the chunk in the indexed array. */
  readonly position: number;
  /** 1-based rank in this result list. */
  readonly rank: number;
  /** BM25 score; strictly positive (chunks that share no term are not returned). */
  readonly score: number;
  /** The typed words (or bag entries) that found this chunk, in query order. */
  readonly matchedTerms: readonly string[];
}

/** Turns a query into weighted index terms; exposed so a UI can show what was searched for. */
export function analyzeQuery(query: RetrievalQuery, options: RetrieveOptions = {}): QueryTerm[] {
  const synonymWeight = options.synonymWeight ?? RETRIEVE_DEFAULTS.synonymWeight;
  const synonyms = normalizedSynonyms(options.synonyms ?? QUERY_SYNONYMS);
  const fromText = typeof query === "string";
  const expand = fromText ? true : (query.expand ?? false);
  const tokens: string[] = [];
  for (const text of fromText ? [query] : query.terms) {
    for (const token of tokenize(text)) if (!isStopword(token)) tokens.push(token);
  }

  const byTerm = new Map<string, QueryTerm>();
  const add = (candidate: QueryTerm): void => {
    const existing = byTerm.get(candidate.term);
    if (!existing || candidate.weight > existing.weight) byTerm.set(candidate.term, candidate);
  };
  for (const token of tokens) add({ term: termOf(token), surface: token, weight: 1, origin: "query" });
  if (expand) {
    for (const token of tokens) {
      for (const phrase of synonyms.get(token) ?? []) {
        for (const word of tokenize(phrase)) {
          if (isStopword(word)) continue;
          add({ term: termOf(word), surface: token, weight: synonymWeight, origin: "synonym" });
        }
      }
    }
  }
  return [...byTerm.values()];
}

type SynonymTable = Readonly<Record<string, readonly string[]>>;

const normalizedTables = new WeakMap<SynonymTable, ReadonlyMap<string, readonly string[]>>();

/** The table keyed by normalised tokens, so a key typed in either Unicode form is found. */
function normalizedSynonyms(table: SynonymTable): ReadonlyMap<string, readonly string[]> {
  let map = normalizedTables.get(table);
  if (!map) {
    map = new Map(Object.entries(table).map(([key, phrases]) => [normalizeText(key), phrases]));
    normalizedTables.set(table, map);
  }
  return map;
}

/** Smoothed inverse document frequency; never negative, even for a term in every chunk. */
function idf(chunkCount: number, documentFrequency: number): number {
  return Math.log(1 + (chunkCount - documentFrequency + 0.5) / (documentFrequency + 0.5));
}

/** Top-N chunks for a query, best first, ties in document order. */
export function retrieve<C extends { text: string }>(
  index: RetrievalIndex<C>,
  query: RetrievalQuery,
  options: RetrieveOptions = {},
): RetrievalHit<C>[] {
  const limit = options.limit ?? RETRIEVE_DEFAULTS.limit;
  if (limit <= 0 || index.indexedCount === 0) return [];
  const { k1, b } = index.options;
  const chunkCount = index.indexedCount;
  const averageLength = index.averageLength > 0 ? index.averageLength : 1;

  const queryTerms = analyzeQuery(query, options);
  const typedWordsPresent = new Set<string>();
  const surfaceOrder = new Map<string, number>();
  for (const { term, surface, origin } of queryTerms) {
    if (!surfaceOrder.has(surface)) surfaceOrder.set(surface, surfaceOrder.size);
    if (origin === "query" && index.postings.has(term)) typedWordsPresent.add(surface);
  }

  const scores = new Map<number, number>();
  const matched = new Map<number, Set<string>>();
  for (const { term, surface, weight, origin } of queryTerms) {
    const postings = index.postings.get(term);
    if (!postings) continue;
    const effectiveWeight = origin === "synonym" && !typedWordsPresent.has(surface) ? 1 : weight;
    const termIdf = idf(chunkCount, postings.length);
    for (const { chunk, tf } of postings) {
      const norm = k1 * (1 - b + (b * index.lengths[chunk]!) / averageLength);
      const gain = effectiveWeight * termIdf * ((tf * (k1 + 1)) / (tf + norm));
      scores.set(chunk, (scores.get(chunk) ?? 0) + gain);
      let words = matched.get(chunk);
      if (!words) matched.set(chunk, (words = new Set()));
      words.add(surface);
    }
  }

  const ordered = [...scores.entries()]
    .filter(([, score]) => score > 0)
    .sort(([chunkA, scoreA], [chunkB, scoreB]) => scoreB - scoreA || chunkA - chunkB)
    .slice(0, limit);
  return ordered.map(([position, score], i) => ({
    chunk: index.chunks[position]!,
    position,
    rank: i + 1,
    score,
    matchedTerms: [...matched.get(position)!].sort((x, y) => surfaceOrder.get(x)! - surfaceOrder.get(y)!),
  }));
}
