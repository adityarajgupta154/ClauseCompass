import { readFileSync } from "node:fs";
import { RULE_REGISTRY } from "@workspace/rules";
import { afterAll, beforeAll, expect } from "vitest";
import { splitParagraphs } from "../../artifacts/api-server/src/extraction/paragraphs";
import { makeDocx } from "../../artifacts/api-server/src/testing/make-docx";
import { makePdf, type MadePdf } from "../../artifacts/api-server/src/testing/make-pdf";
import { bootApi, openSession, prepare, type TestApi } from "../support/api-server";
import { FIELD_IDS, LINES_PER_PAGE, MOCK_MARKER } from "./pipeline.goldens";
import type { FixtureGolden, PromptRow, Relevance } from "./pipeline.goldens";

export { COMPARE, NDA, OFFER_LETTER, RENTAL } from "./pipeline.goldens";

// ---------------------------------------------------------------------------
// Response shapes, as far as this suite reads them.

interface Location {
  page: number | null;
  paragraph: number;
  clause: string | null;
}

export interface Chunk {
  id: string;
  text: string;
  location: Location;
}
export interface Claim {
  text: string;
  quote: string;
  source_chunk_ids: string[];
  location: Location;
  category: string;
  confidence: number;
}
interface MapField {
  id: FieldId;
  status: string;
  claims: Claim[];
  evidence: string[];
  withheld: number;
  reason: string | null;
}
export interface DocumentMeta {
  kind: string;
  pageCount: number | null;
  wordCount: number;
  paragraphCount: number;
}
export interface MapResponse {
  document: DocumentMeta;
  chunks: Chunk[];
  map: { fields: MapField[] };
  timeline: { items: Array<{ date: string; asWritten: string; ambiguity: unknown; claim: Claim; topics: string[] }> };
}
export interface ReviewResponse {
  document: DocumentMeta;
  chunks: Chunk[];
  stage: Stage;
  prompts: Array<RuleCard & { relevance: Relevance; prompt: Claim | null; phrasedBy: string; reason: string | null; places: Claim[] }>;
  notFound: RuleCard[];
  withheld: number;
}
/** What a review prompt (or a not-found entry) says about its rule; all of it is the registry's. */
interface RuleCard {
  ruleId: string;
  family: string;
  category: string;
  title: string;
  whyItMatters?: string;
}
export interface CompareSide {
  chunkId: string;
  location: Location;
  segments: Array<{ text: string; changed: boolean }>;
}
export interface CompareResponse {
  older: { document: DocumentMeta; chunks: Chunk[] };
  newer: { document: DocumentMeta; chunks: Chunk[] };
  changes: Array<{
    id: string;
    status: string;
    kind: string;
    signals: string[];
    older: CompareSide | null;
    newer: CompareSide | null;
    values: { older: string[]; newer: string[] };
  }>;
  aligned: number;
  unchanged: number;
  byKind: Record<string, number>;
}

// ---------------------------------------------------------------------------

const root = new URL("../../", import.meta.url);
const readFixture = (file: string) => readFileSync(new URL(`samples/${file}`, root), "utf8");

export type Format = "txt" | "pdf" | "docx";
export interface Rendering {
  format: Format;
  fileName: string;
  bytes: Uint8Array;
  /** Page each paragraph was printed on (1-based paragraph index → page); PDF only. */
  pageOf: (paragraph: number) => number | null;
  pdf?: MadePdf;
}

export function render(file: string, format: Format): Rendering {
  const text = readFixture(file);
  const base = file.replace(/\.txt$/, "");
  if (format === "txt") return { format, fileName: file, bytes: new TextEncoder().encode(text), pageOf: () => null };
  const paragraphs = splitParagraphs(text);
  if (format === "docx") return { format, fileName: `${base}.docx`, bytes: makeDocx(paragraphs), pageOf: () => null };
  const pdf = makePdf(paragraphs, { linesPerPage: LINES_PER_PAGE });
  const pages = new Map<number, number>();
  let index = 0;
  for (const page of pdf.pages) for (const _ of page.paragraphs) pages.set(++index, page.page);
  return { format, fileName: `${base}.pdf`, bytes: pdf.bytes, pageOf: (paragraph) => pages.get(paragraph) ?? null, pdf };
}

/** The label the product shows for a chunk: its clause number, or its id for unnumbered text. */
export const labelOf = (chunk: Chunk): string => chunk.location.clause ?? chunk.id;

export function chunkByLabel(chunks: Chunk[], label: string): Chunk {
  const matches = chunks.filter((chunk) => labelOf(chunk) === label);
  expect(matches, `exactly one chunk labelled "${label}"`).toHaveLength(1);
  return matches[0]!;
}

export function labelsOf(chunks: Chunk[], ids: string[]): string[] {
  return ids.map((id) => {
    const chunk = chunks.find((candidate) => candidate.id === id);
    expect(chunk, `cited chunk ${id} is in the response`).toBeDefined();
    return labelOf(chunk!);
  });
}

/**
 * A statement cites one paragraph of the response and quotes it word for
 * word. A statement the model phrased carries the mock's marker, so no
 * wording is mistaken for analysis; one the product lifted from the document
 * (a timeline entry, a place to look) is the paragraph's own words, ellipses
 * aside; a registry template is neither, and only its citation is checked.
 */
export function expectGrounded(claim: Claim, chunks: Chunk[], phrasedBy: "model" | "document" | "template" = "model"): Chunk {
  expect(claim.source_chunk_ids).toHaveLength(1);
  const chunk = chunks.find((candidate) => candidate.id === claim.source_chunk_ids[0]);
  expect(chunk, `claim cites a chunk in the response (${claim.source_chunk_ids[0]})`).toBeDefined();
  // The location shown beside the statement is the cited paragraph's own.
  expect(claim.location).toEqual(chunk!.location);
  expect(claim.quote.length).toBeGreaterThan(0);
  expect(chunk!.text).toContain(claim.quote);
  if (phrasedBy === "model") expect(claim.text.startsWith(MOCK_MARKER), `mock marker on "${claim.text.slice(0, 60)}"`).toBe(true);
  if (phrasedBy === "document") expect(chunk!.text).toContain(claim.text.replace(/^\u2026/, "").replace(/\u2026$/, ""));
  // Words lifted from the document, or a template, are stated with full confidence; the mock's own figure is the mock's.
  if (phrasedBy !== "model") expect(claim.confidence).toBe(1);
  return chunk!;
}

const RULES = new Map(RULE_REGISTRY.rules.map((rule) => [rule.id, rule]));

/** What a card says about its rule is the registry's wording for that rule, never the model's. */
function expectRuleCard(card: RuleCard, withWhy: boolean) {
  const rule = RULES.get(card.ruleId);
  expect(rule, `${card.ruleId} is a registry rule`).toBeDefined();
  const expected: RuleCard = { ruleId: rule!.id, family: rule!.family, category: rule!.category, title: rule!.title };
  if (withWhy) expected.whyItMatters = rule!.whyItMatters;
  expect(card).toEqual(expected);
  return rule!;
}

export function expectDocument(meta: DocumentMeta, golden: { paragraphCount: number; wordCount: number }, rendering: Rendering) {
  expect(meta).toEqual({
    kind: rendering.format,
    pageCount: rendering.pdf?.pageCount ?? null,
    wordCount: golden.wordCount,
    paragraphCount: golden.paragraphCount,
  });
}

/** Every chunk is one paragraph, numbered in order, on the page it was printed on; every cited label sits where the table says. */
function expectChunks(chunks: Chunk[], golden: FixtureGolden, rendering: Rendering) {
  expect(chunks.map((chunk) => chunk.id)).toEqual(chunks.map((_, index) => `p${index + 1}`));
  expect(chunks.map((chunk) => chunk.location.paragraph)).toEqual(chunks.map((_, index) => index + 1));
  expect(chunks.map((chunk) => chunk.location.page)).toEqual(chunks.map((_, index) => rendering.pageOf(index + 1)));
  if (rendering.pdf) {
    const starts = rendering.pdf.pages.map((page) => chunks.findIndex((chunk) => chunk.location.page === page.page) + 1);
    expect(starts, "first paragraph on each page").toEqual(golden.pdfPageStarts);
  }
  for (const [label, [paragraph, startsWith]] of Object.entries(golden.cited)) {
    const chunk = chunkByLabel(chunks, label);
    expect(chunk.location.paragraph, `${label} is paragraph ${paragraph}`).toBe(paragraph);
    expect(chunk.text.startsWith(startsWith), `${label} begins "${startsWith}", got "${chunk.text.slice(0, 80)}"`).toBe(true);
  }
}

export function expectMap(body: MapResponse, golden: FixtureGolden, rendering: Rendering) {
  expectDocument(body.document, golden, rendering);
  expectChunks(body.chunks, golden, rendering);

  expect(body.map.fields.map((field) => field.id)).toEqual([...FIELD_IDS]);
  for (const field of body.map.fields) {
    expect(field.status, field.id).toBe("found");
    expect([field.withheld, field.reason], field.id).toEqual([0, null]);
    expect(labelsOf(body.chunks, field.evidence), `${field.id} evidence`).toEqual(golden.evidence[field.id]);
    expect(field.claims.length, `${field.id} has statements`).toBeGreaterThan(0);
    const cited = field.claims.map((claim) => expectGrounded(claim, body.chunks).id);
    // Statements come from the evidence, in its order, and never from anywhere else.
    expect(field.evidence.filter((id) => cited.includes(id)), `${field.id} statements cite its evidence in order`).toEqual(cited);
  }

  const items = body.timeline.items;
  expect(items.map((item) => [item.date, item.asWritten, labelOf(expectGrounded(item.claim, body.chunks, "document")), item.topics])).toEqual(golden.timeline);
  for (const item of items) {
    expect(item.ambiguity).toBeNull();
    expect(item.claim.category).toBe("date");
    // The date shown is the document's own wording, and that is exactly what the entry quotes.
    expect(item.claim.quote).toBe(item.asWritten);
    // A topic is the title of a rule the paragraph raises.
    for (const topic of item.topics) expect(RULE_REGISTRY.rules.some((rule) => rule.title === topic), `"${topic}" is a rule title`).toBe(true);
  }
}

export function expectReview(body: ReviewResponse, golden: FixtureGolden, rendering: Rendering) {
  expectDocument(body.document, golden, rendering);
  expectChunks(body.chunks, golden, rendering);
  expect(body.stage).toBe(golden.stage);
  expect(body.withheld).toBe(0);
  expect(body.notFound.map((entry) => entry.ruleId)).toEqual(golden.notFound);
  for (const entry of body.notFound) expectRuleCard(entry, false);

  const rows: Record<Relevance, PromptRow[]> = { primary: [], secondary: [], background: [] };
  for (const { relevance, prompt: question, phrasedBy, reason, places: placeClaims, ...card } of body.prompts) {
    const prompt = { relevance, prompt: question, phrasedBy, reason, places: placeClaims, ruleId: card.ruleId };
    const rule = expectRuleCard(card, true);
    expect(prompt.prompt, `${prompt.ruleId} has a question`).not.toBeNull();
    // The question and every place carry the rule's category.
    expect(prompt.prompt!.category).toBe(rule.category);
    for (const place of prompt.places) expect(place.category).toBe(rule.category);
    // Background prompts are not put to the model; the registry's template asks them.
    if (prompt.relevance === "background") expect([prompt.phrasedBy, prompt.reason]).toEqual(["template", "not-asked"]);
    else expect([prompt.phrasedBy, prompt.reason]).toEqual(["model", null]);
    const restsOn = expectGrounded(prompt.prompt!, body.chunks, prompt.phrasedBy === "model" ? "model" : "template");
    const places = prompt.places.map((place) => labelOf(expectGrounded(place, body.chunks, "document")));
    expect(places, `${prompt.ruleId}'s question rests on one of its places`).toContain(labelOf(restsOn));
    rows[prompt.relevance].push([prompt.ruleId, labelOf(restsOn), places]);
  }
  expect(rows).toEqual(golden.prompts);
  // Primary prompts come first, then secondary, then background.
  const order = body.prompts.map((prompt) => prompt.relevance);
  expect(order).toEqual([...order].sort((a, b) => ["primary", "secondary", "background"].indexOf(a) - ["primary", "secondary", "background"].indexOf(b)));
}

/** The same body with every page number removed: what must agree between the text, PDF and DOCX renderings of one document. */
export function withoutPages<T>(body: T): T {
  return JSON.parse(JSON.stringify(body, (key, value) => (key === "page" ? null : value))) as T;
}

export let api: TestApi;
beforeAll(async () => {
  api = await bootApi();
});
afterAll(() => api.close());

export async function run(golden: FixtureGolden, format: Format) {
  const rendering = render(golden.file, format);
  const id = await openSession(api.baseUrl, golden.stage, { fileName: rendering.fileName, bytes: rendering.bytes });
  const map = await prepare(api.baseUrl, id, "document-map");
  const review = await prepare(api.baseUrl, id, "review-prompts");
  expect([map.status, review.status]).toEqual([200, 200]);
  return { rendering, map: JSON.parse(map.body) as MapResponse, review: JSON.parse(review.body) as ReviewResponse };
}

