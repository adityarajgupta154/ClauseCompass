import type { GroundedClaim, SourceChunk } from "@workspace/grounding";
import { evaluateRules, type DocumentTypeId, type RuleHit, type StageId } from "@workspace/rules";
import type { Logger } from "pino";
import { generateClaims, type LlmProvider } from "../llm";
import { TIMELINE_CATEGORY, findDates } from "./dates";
import { PARTIES_CATEGORY, findPartyChunks } from "./parties";
import { spanOf, verbatimClaim, windowAround, type Span } from "./verbatim";

/**
 * The Document Map (PRD section 5 step 4, FR-04): parties, dates, money,
 * duties, termination and dispute wording, each in an explicit state.
 *
 * The deterministic layer decides what there is to show: the clause rules
 * (and the date and party detectors) select the paragraphs for each field.
 * Only those paragraphs go to the model, which restates them; the validator
 * keeps what it can verify. A field with no selected paragraph is
 * "not-found" and the model is never asked about it, so nothing can be
 * invented for a field the document is silent on. A field whose paragraphs
 * were found but for which no restatement survived — the model was down,
 * or nothing it said passed the evidence check — is "wording-only": the
 * paragraphs are shown in the document's own words, with the reason, and
 * never presented as "not found".
 */

export const MAP_FIELD_IDS = ["parties", "dates", "money", "duties", "termination", "dispute"] as const;
export type MapFieldId = (typeof MAP_FIELD_IDS)[number];

export type MapFieldStatus = "found" | "wording-only" | "not-found";
export type WordingOnlyReason = "model-unavailable" | "nothing-verified";

export interface MapField {
  id: MapFieldId;
  status: MapFieldStatus;
  /** Verified restatements (found) or the located wording itself (wording-only); empty when not found. */
  claims: GroundedClaim[];
  /** Ids of the paragraphs the deterministic layer selected for this field, in document order. */
  evidence: string[];
  /** Restatements the validator withheld in the model's final attempt. */
  withheld: number;
  /** Set only when wording-only. */
  reason: WordingOnlyReason | null;
}

export interface DocumentMap {
  fields: MapField[];
}

/** Paragraphs per field, and characters per field, that the model is shown. */
export const MAX_FIELD_CHUNKS = 6;
export const MAX_FIELD_CHARS = 7_000;
/** A paragraph longer than this is shown to the model as a window around its match, not whole. */
export const MAX_EXCERPT_CHARS = 4_000;

interface FieldSpec {
  id: MapFieldId;
  /** The task line the model gets; written by the pipeline, never by the reader. */
  task: string;
  /** Allowed category keys for this field's claims (registry categories, plus the two detector categories). */
  categories: readonly string[];
  maxClaims: number;
  /** Rule ids whose hits are this field's evidence, in addition to any detector. */
  rules: readonly string[];
}

const EXACTLY = "exactly as the excerpts state them";

export const FIELD_SPECS: readonly FieldSpec[] = [
  {
    id: "parties",
    task: `Name the parties to this document and the role each one plays (for example licensor and licensee, employer and employee, disclosing and receiving party), ${EXACTLY}. Leave out addresses.`,
    categories: [PARTIES_CATEGORY],
    maxClaims: 3,
    rules: [],
  },
  {
    id: "dates",
    task: `Describe how long this arrangement lasts and the exact dates it names: when it starts and ends, any deadline, and what a renewal or extension requires, ${EXACTLY}.`,
    categories: [TIMELINE_CATEGORY, "term", "renewal", "deadline"],
    maxClaims: 4,
    rules: ["time.dated", "time.term", "time.renewal", "time.deadline"],
  },
  {
    id: "money",
    task: `Describe the money terms: what has to be paid, how much and when, any deposit and how it is returned, any late fee, penalty or other charge, and who pays which costs, ${EXACTLY}.`,
    categories: ["payment", "deposit", "penalty", "bond", "discretionary", "charges"],
    maxClaims: 4,
    rules: [
      "money.payment-terms",
      "money.deposit",
      "money.late-fees",
      "money.bond-repayment",
      "money.discretionary",
      "money.who-pays",
    ],
  },
  {
    id: "duties",
    task: `Describe the main duties and restrictions the document places on each side: what must be done, what is not allowed, and what one side may decide on its own, ${EXACTLY}.`,
    categories: ["non-compete", "non-solicit", "restriction", "one-sided", "upkeep", "hours", "one-way", "condition"],
    maxClaims: 4,
    rules: [
      "duty.non-compete",
      "duty.non-solicit",
      "duty.restrictions",
      "duty.one-sided",
      "duty.upkeep",
      "duty.hours",
      "duty.one-way",
      "duty.conditions",
    ],
  },
  {
    id: "termination",
    task: `Describe how this arrangement can be ended: who can end it, how much notice is needed, any lock-in or minimum period, when it can be ended at once, and what has to happen on ending, ${EXACTLY}.`,
    categories: ["notice", "notice-service", "termination", "lock-in", "handover"],
    maxClaims: 4,
    rules: ["exit.notice", "exit.notice-service", "exit.termination", "exit.lock-in", "exit.handover"],
  },
  {
    id: "dispute",
    task: `Describe how a dispute would be handled: which law the document says applies, which courts or authority it says decide, whether it provides for arbitration or mediation, where, and who appoints or pays, ${EXACTLY}. Naming the law, court or authority the document itself chooses is describing the document.`,
    categories: ["dispute"],
    maxClaims: 3,
    rules: ["exit.disputes"],
  },
];

/** One selected paragraph: the chunk, where in it the selecting cue matched, and the category the cue carries. */
export interface Evidence {
  chunk: SourceChunk;
  match: Span;
  category: string;
}

export interface BuildMapOptions {
  stage?: StageId;
  documentType?: DocumentTypeId;
  provider: LlmProvider;
  model: string;
  log?: Pick<Logger, "info" | "warn">;
  signal?: AbortSignal;
  /** Rule hits over the same chunks, when the caller already has them. */
  hits?: readonly RuleHit<SourceChunk>[];
}

function fromHits(hits: readonly RuleHit<SourceChunk>[], ruleIds: readonly string[]): Evidence[] {
  const wanted = new Set(ruleIds);
  const evidence: Evidence[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    if (!wanted.has(hit.ruleId) || seen.has(hit.chunk.id)) continue;
    const match = spanOf(hit.chunk.text, hit.matched);
    if (!match) continue;
    seen.add(hit.chunk.id);
    evidence.push({ chunk: hit.chunk, match, category: hit.category });
  }
  return evidence;
}

function fromDates(chunks: readonly SourceChunk[]): Evidence[] {
  const evidence: Evidence[] = [];
  for (const chunk of chunks) {
    const first = findDates(chunk.text)[0];
    if (first) evidence.push({ chunk, match: first.span, category: TIMELINE_CATEGORY });
  }
  return evidence;
}

function fromParties(chunks: readonly SourceChunk[]): Evidence[] {
  return findPartyChunks(chunks).map(({ chunk, match }) => ({ chunk, match, category: PARTIES_CATEGORY }));
}

/** The excerpt the model sees for one piece of evidence: the paragraph, or a window of it when it is very long. */
export function excerptOf({ chunk, match }: Evidence): SourceChunk {
  const { text } = chunk;
  if (text.length <= MAX_EXCERPT_CHARS) return chunk;
  const shown = windowAround(text, { start: 0, end: text.length }, match, MAX_EXCERPT_CHARS);
  return { ...chunk, text: text.slice(shown.start, shown.end) };
}

/**
 * Keeps the evidence in priority order until the per-field caps are reached
 * (the first item always fits), then returns it in document order, which
 * is how the model should read it. Duplicates by chunk are dropped, first
 * occurrence winning.
 */
export function capEvidence(ordered: readonly Evidence[]): Evidence[] {
  const kept: Evidence[] = [];
  const seen = new Set<string>();
  let chars = 0;
  for (const item of ordered) {
    if (kept.length >= MAX_FIELD_CHUNKS) break;
    if (seen.has(item.chunk.id)) continue;
    const length = excerptOf(item).text.length;
    // One long paragraph must not crowd out shorter, later evidence that still fits.
    if (kept.length > 0 && chars + length > MAX_FIELD_CHARS) continue;
    seen.add(item.chunk.id);
    kept.push(item);
    chars += length;
  }
  return kept.sort((x, y) => x.chunk.location.paragraph - y.chunk.location.paragraph);
}

/** The paragraphs selected for one field, in priority order (before the cap). */
export function selectEvidence(
  spec: FieldSpec,
  chunks: readonly SourceChunk[],
  hits: readonly RuleHit<SourceChunk>[],
): Evidence[] {
  switch (spec.id) {
    case "parties":
      return fromParties(chunks);
    case "dates":
      return [...fromDates(chunks), ...fromHits(hits, spec.rules)];
    default:
      return fromHits(hits, spec.rules);
  }
}

const notFound = (id: MapFieldId): MapField => ({
  id,
  status: "not-found",
  claims: [],
  evidence: [],
  withheld: 0,
  reason: null,
});

async function buildField(spec: FieldSpec, evidence: Evidence[], options: BuildMapOptions): Promise<MapField> {
  if (evidence.length === 0) return notFound(spec.id);
  const ids = evidence.map((item) => item.chunk.id);
  const result = await generateClaims(
    {
      task: spec.task,
      chunks: evidence.map(excerptOf),
      categories: spec.categories,
      maxClaims: spec.maxClaims,
    },
    options.provider,
    { model: options.model, log: options.log, signal: options.signal },
  );
  if (result.ok && result.claims.length > 0) {
    return { id: spec.id, status: "found", claims: result.claims, evidence: ids, withheld: result.withheld, reason: null };
  }
  return {
    id: spec.id,
    status: "wording-only",
    claims: evidence.map((item) => verbatimClaim(item.chunk, item.match, item.category, { quote: "sentence" })),
    evidence: ids,
    withheld: result.ok ? result.withheld : 0,
    reason: !result.ok && result.reason === "provider-error" ? "model-unavailable" : "nothing-verified",
  };
}

/**
 * Builds the map for one document. Fields run concurrently: each is one
 * model call at most, and a failure reported by the provider on one field
 * degrades that field alone. Anything the provider does not report as its
 * own failure (a bug, the caller's abort) propagates.
 */
export async function buildDocumentMap(chunks: readonly SourceChunk[], options: BuildMapOptions): Promise<DocumentMap> {
  const hits = options.hits ?? evaluateRules(chunks, { stage: options.stage, documentType: options.documentType });
  const fields = await Promise.all(
    FIELD_SPECS.map((spec) => buildField(spec, capEvidence(selectEvidence(spec, chunks, hits)), options)),
  );
  return { fields };
}
