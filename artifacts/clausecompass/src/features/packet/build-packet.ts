import type {
  DocumentMapResponse,
  GroundedClaim,
  HitRelevance,
  MapField,
  ReviewPrompt,
  ReviewPromptsResponse,
  RuleFamilyId,
  SourceChunk,
  TimelineItem,
} from "@workspace/api-client-react";
import { describeAmbiguity, formatIsoDate, groupTimeline } from "@/features/analysis/timeline-groups";
import { formatLocation } from "@/features/grounding/format-location";
import { indexChunks, resolveClaim, type ChunkIndex, type ResolvedClaim } from "@/features/grounding/resolve-claim";
// The packet is prepared in English whatever language the screen shows (FR-09, FR-11), so it reads the English table, not the live `copy`.
import { en as copy } from "@/features/journey/copy";
import type { StageId } from "@/features/journey/stages";

/**
 * The Preparation Packet (PRD FR-09) as reader-facing content, built once
 * from the Document Map and the Review Prompts the reader has already seen.
 * Every string here is final: the print view and the text file are two
 * serialisations of this one model, so what is on paper is exactly what is
 * in the file, and a scan of either covers both. Nothing from the API that
 * is not a sentence for the reader - ids, keys, confidences, reasons in
 * enum form - reaches the model; claims go through the same resolveClaim
 * gate as the screens, so an unverifiable statement is withheld here too.
 *
 * Citations are numbered in order of first use across the whole packet and
 * listed once at the end with the exact wording, so a statement, a question
 * and a checklist line that rest on the same paragraph share one number.
 */

export interface PacketInput {
  stage: StageId;
  /** The analysed file's name (the newer version when two were compared). */
  fileName: string;
  map: DocumentMapResponse;
  review: ReviewPromptsResponse;
  preparedAt: Date;
}

export type PacketItem =
  /** A plain-language statement of the map or the timeline, with the numbers of the passages it rests on. */
  | { kind: "statement"; topic: string | null; text: string; citations: number[]; note: string | null }
  /** A review prompt: the question to ask, why it matters, where the clause was found. */
  | {
      kind: "question";
      family: string;
      title: string;
      why: string;
      /** The question itself, or the withheld sentence when it could not be verified. */
      question: string;
      withheld: boolean;
      citations: number[];
      places: number[];
      note: string | null;
    }
  /** One line of the evidence checklist. */
  | { kind: "check"; text: string; citations: number[] }
  /** The exact wording behind a number. */
  | { kind: "citation"; number: number; location: string; text: string }
  /** A sentence that stands alone: not found, withheld, empty. */
  | { kind: "note"; topic: string | null; text: string };

export interface PacketGroup {
  id: string;
  heading: string | null;
  note: string | null;
  items: PacketItem[];
  footnote: string | null;
}

export type PacketSectionId = "summary" | "dates" | "questions" | "evidence" | "citations";

export interface PacketSection {
  id: PacketSectionId;
  heading: string;
  lead: string;
  groups: PacketGroup[];
  /** Sentences that close the section, e.g. how many statements were withheld. */
  notes: string[];
}

export interface Packet {
  title: string;
  subtitle: string;
  /** The boundary in one line, under the title, so it is on the first page of every export. */
  notice: string;
  /** Document, situation, date: one line each. */
  about: string[];
  sections: PacketSection[];
  /** The full boundary statement, closing the export. */
  disclaimer: { title: string; points: string[]; closing: string };
}

const RELEVANCE_ORDER: readonly HitRelevance[] = ["primary", "secondary", "background"];
const FAMILY_ORDER: readonly RuleFamilyId[] = ["money", "time", "duty", "exit", "data-ip"];

/** Numbers passages in order of first use and keeps the list for the closing section. */
class Citations {
  private readonly numbers = new Map<string, number>();
  readonly items: Extract<PacketItem, { kind: "citation" }>[] = [];

  cite(chunk: SourceChunk): number {
    const known = this.numbers.get(chunk.id);
    if (known !== undefined) return known;
    const number = this.items.length + 1;
    this.numbers.set(chunk.id, number);
    this.items.push({ kind: "citation", number, location: formatLocation(chunk.location, copy.sourceCard.location), text: chunk.text });
    return number;
  }

  citeAll(chunks: readonly SourceChunk[]): number[] {
    return chunks.map((chunk) => this.cite(chunk));
  }
}

function sentences(...parts: (string | null | undefined)[]): string | null {
  const kept = parts.filter((part): part is string => typeof part === "string" && part.length > 0);
  return kept.length === 0 ? null : kept.join(" ");
}

function withheldSentence(reason: Extract<ResolvedClaim, { status: "ungrounded" }>["reason"]): string {
  const words = copy.sourceCard.fallback;
  return `${words.title}. ${words.reasons[reason]} ${words.why}`;
}

/** The same gate as SourceCard: a statement is shown with its passages or visibly withheld, never bare. */
function statementItem(claim: unknown, chunks: ChunkIndex, citations: Citations, topic: string | null, note: string | null): PacketItem {
  const resolved = resolveClaim(claim, chunks);
  if (resolved.status === "ungrounded") {
    return { kind: "note", topic, text: sentences(note, withheldSentence(resolved.reason)) ?? "" };
  }
  const words = copy.sourceCard;
  return {
    kind: "statement",
    topic,
    text: resolved.claim.text,
    citations: citations.citeAll(resolved.excerpts),
    note: sentences(
      note,
      resolved.lowConfidence ? words.lowConfidence : null,
      resolved.unresolvedIds.length > 0 ? words.unresolved(resolved.unresolvedIds.length) : null,
    ),
  };
}

function summarySection(map: DocumentMapResponse, chunks: ChunkIndex, citations: Citations): PacketSection {
  const words = copy.packet.sections.summary;
  return {
    id: "summary",
    heading: words.heading,
    lead: words.lead,
    groups: map.map.fields.map((field) => fieldGroup(field, chunks, citations)),
    notes: [],
  };
}

function fieldGroup(field: MapField, chunks: ChunkIndex, citations: Citations): PacketGroup {
  const words = copy.map.fields[field.id];
  const group: PacketGroup = { id: `field-${field.id}`, heading: words.title, note: words.description, items: [], footnote: null };
  if (field.status === "not-found") {
    group.items.push({ kind: "note", topic: null, text: `${copy.map.notFound.title}. ${copy.map.notFound.body(words.missing)}` });
    return group;
  }
  if (field.status === "wording-only" && field.reason) {
    group.items.push({ kind: "note", topic: null, text: `${copy.map.wordingOnly.title}. ${copy.map.wordingOnly.reasons[field.reason]}` });
  }
  for (const claim of field.claims) {
    group.items.push(statementItem(claim, chunks, citations, copy.map.topics[claim.category] ?? null, null));
  }
  if (field.withheld > 0) group.footnote = copy.map.withheld(field.withheld);
  return group;
}

function datesSection(items: readonly TimelineItem[], chunks: ChunkIndex, citations: Citations): PacketSection {
  const words = copy.packet.sections.dates;
  const groups = groupTimeline(items).map(
    (group): PacketGroup => ({
      id: `date-${group.date}`,
      heading: formatIsoDate(group.date),
      note: null,
      items: group.items.map((item) => dateItem(item, chunks, citations)),
      footnote: null,
    }),
  );
  if (groups.length === 0) {
    groups.push({
      id: "dates-none",
      heading: null,
      note: null,
      items: [{ kind: "note", topic: null, text: `${copy.timeline.empty.title}. ${copy.timeline.empty.body}` }],
      footnote: null,
    });
  }
  return { id: "dates", heading: words.heading, lead: words.lead, groups, notes: [] };
}

function dateItem(item: TimelineItem, chunks: ChunkIndex, citations: Citations): PacketItem {
  const words = copy.timeline;
  const topics = item.topics.slice(0, 2);
  const topic = topics.length > 0 ? topics.join(copy.sourceCard.location.separator) : copy.map.topics.date;
  const ambiguity = describeAmbiguity(item);
  const note = ambiguity ? `${words.ambiguityLabel}. ${words.asWritten(item.asWritten)}. ${ambiguity}` : null;
  return statementItem(item.claim, chunks, citations, topic, note);
}

function questionsSection(review: ReviewPromptsResponse, chunks: ChunkIndex, citations: Citations): PacketSection {
  const words = copy.packet.sections.questions;
  const section: PacketSection = { id: "questions", heading: words.heading, lead: words.lead, groups: [], notes: [] };

  if (review.prompts.length === 0) {
    section.groups.push({
      id: "questions-none",
      heading: copy.review.empty.title,
      note: null,
      items: [{ kind: "note", topic: null, text: copy.review.empty.body }],
      footnote: null,
    });
  }
  for (const relevance of RELEVANCE_ORDER) {
    const prompts = review.prompts.filter((prompt) => prompt.relevance === relevance);
    if (prompts.length === 0) continue;
    const group = copy.review.groups[relevance];
    section.groups.push({
      id: `questions-${relevance}`,
      heading: group.title,
      note: group.description,
      items: prompts.map((prompt) => questionItem(prompt, chunks, citations)),
      footnote: null,
    });
  }
  if (review.withheld > 0) section.notes.push(copy.review.withheld(review.withheld));
  if (review.notFound.length > 0) {
    section.groups.push({
      id: "questions-not-found",
      heading: copy.review.notFound.title,
      note: words.notFoundLead,
      items: review.notFound.map((absent) => ({
        kind: "note",
        topic: copy.review.family[absent.family],
        text: absent.title,
      })),
      footnote: null,
    });
  }
  return section;
}

function questionItem(prompt: ReviewPrompt, chunks: ChunkIndex, citations: Citations): PacketItem {
  const template = prompt.phrasedBy === "template" && prompt.reason ? copy.review.card.template : null;
  const note = template && prompt.reason ? `${template.title}. ${template.reasons[prompt.reason]}` : null;
  const resolved = resolveClaim(prompt.prompt, chunks);
  // The question is read before its places, so its own passages take their
  // numbers first: numbering follows the order of first use on the page.
  const questionCitations = resolved.status === "grounded" ? citations.citeAll(resolved.excerpts) : [];
  const base = {
    kind: "question" as const,
    family: copy.review.family[prompt.family],
    title: prompt.title,
    why: prompt.whyItMatters,
    places: placeNumbers(prompt.places, chunks, citations),
  };
  if (resolved.status === "ungrounded") {
    return { ...base, question: withheldSentence(resolved.reason), withheld: true, citations: [], note };
  }
  const words = copy.sourceCard;
  return {
    ...base,
    question: resolved.claim.text,
    withheld: false,
    citations: questionCitations,
    note: sentences(
      note,
      resolved.lowConfidence ? words.lowConfidence : null,
      resolved.unresolvedIds.length > 0 ? words.unresolved(resolved.unresolvedIds.length) : null,
    ),
  };
}

/**
 * A place is the document's own sentence in a paragraph; one that cannot be
 * traced to a paragraph is not cited, as on the review screen. The numbers
 * are listed ascending: a "Found at" line is a set of passages, and reading
 * it in the order of the citation list is easier than in the order the
 * server ranked them.
 */
function placeNumbers(places: readonly GroundedClaim[], chunks: ChunkIndex, citations: Citations): number[] {
  const numbers = new Set<number>();
  for (const place of places) {
    const resolved = resolveClaim(place, chunks);
    if (resolved.status === "grounded") numbers.add(citations.cite(resolved.excerpts[0]));
  }
  return [...numbers].sort((a, b) => a - b);
}

/**
 * The evidence checklist is ClauseCompass's own, not the document's: fixed
 * lines for every packet and for the moment, then one line per clause
 * family found, pointing at the passages of that family's prompts so each
 * line can be traced to the clauses it is for.
 */
function evidenceSection(stage: StageId, review: ReviewPromptsResponse, chunks: ChunkIndex, citations: Citations): PacketSection {
  const words = copy.packet.sections.evidence;
  const items: PacketItem[] = [
    ...words.always.map((text): PacketItem => ({ kind: "check", text, citations: [] })),
    ...words.stage[stage].map((text): PacketItem => ({ kind: "check", text, citations: [] })),
  ];
  for (const family of FAMILY_ORDER) {
    const prompts = review.prompts.filter((prompt) => prompt.family === family);
    if (prompts.length === 0) continue;
    const numbers = new Set<number>();
    for (const prompt of prompts) for (const number of placeNumbers(prompt.places, chunks, citations)) numbers.add(number);
    items.push({ kind: "check", text: words.family[family], citations: [...numbers].sort((a, b) => a - b) });
  }
  return {
    id: "evidence",
    heading: words.heading,
    lead: words.lead,
    groups: [{ id: "evidence", heading: null, note: null, items, footnote: null }],
    notes: [],
  };
}

function citationsSection(citations: Citations): PacketSection {
  const words = copy.packet.sections.citations;
  return {
    id: "citations",
    heading: words.heading,
    lead: words.lead,
    groups: [{ id: "citations", heading: null, note: null, items: citations.items, footnote: null }],
    notes: [],
  };
}

export function formatPreparedAt(date: Date): string {
  return new Intl.DateTimeFormat(copy.packet.document.locale, { day: "numeric", month: "long", year: "numeric" }).format(date);
}

export function buildPacket({ stage, fileName, map, review, preparedAt }: PacketInput): Packet {
  // Both responses carry the same paragraphs; indexing both keeps the packet whole if one ever carries more.
  const chunks = indexChunks([...map.chunks, ...review.chunks]);
  const citations = new Citations();
  const words = copy.packet.document;
  const { document } = map;

  const sections = [
    summarySection(map, chunks, citations),
    datesSection(map.timeline.items, chunks, citations),
    questionsSection(review, chunks, citations),
    evidenceSection(stage, review, chunks, citations),
  ];
  sections.push(citationsSection(citations));

  const about = [
    words.file(fileName, copy.analysis.documentSummary(document.kind, document.paragraphCount, document.pageCount)),
    ...(stage === "compare-versions" ? [words.newerVersion(fileName)] : []),
    words.situation(copy.stages[stage].label),
    words.preparedOn(formatPreparedAt(preparedAt)),
  ];

  return {
    title: words.title,
    subtitle: words.subtitle,
    notice: words.notice,
    about,
    sections,
    disclaimer: { title: copy.boundary.title, points: [...copy.boundary.points], closing: copy.packet.closing },
  };
}

/** "[1], [4]": the reference numbers as they read inline, in the text and print views alike. */
export function formatReferences(numbers: readonly number[]): string {
  return numbers.map((number) => copy.packet.document.reference(number)).join(", ");
}
