import type { GroundedClaim, SourceChunk } from "@workspace/grounding";
import { isIsoDate, type IsoDate, type RuleHit } from "@workspace/rules";
import { verbatimClaim, type Span } from "./verbatim";

/**
 * The explicit-date timeline (PRD FR-05). Deterministic: a date is on the
 * timeline only if the document writes it out in full — day, month and
 * year — and every item carries the sentence it was found in, the chunk it
 * cites and the date exactly as written. Relative periods ("thirty days
 * after notice") are the clause rules' business, not the timeline's, and
 * partial dates ("April 2027") are not explicit enough to be placed on it.
 *
 * Numbers can be read two ways. "03/04/2026" is 3 April in the Indian
 * convention and 4 March in the American one; the item takes the day-first
 * reading and says so, with the other reading attached, so the person sees
 * an explicit uncertainty label instead of a silent choice. A two-digit
 * year is read as this century and flagged the same way; a date that is
 * uncertain in both ways says both.
 */

export const TIMELINE_CATEGORY = "date";

export type DateAmbiguityKind = "day-month-order" | "two-digit-year";

/** Why a date's reading is not certain; a date like "03/04/26" carries both kinds. */
export interface DateAmbiguity {
  kinds: DateAmbiguityKind[];
  /** The other reading when the day and month could be swapped; null otherwise. */
  alternative: IsoDate | null;
}

export interface DateMention {
  /** The primary reading. */
  date: IsoDate;
  /** The date exactly as the document writes it. */
  asWritten: string;
  span: Span;
  ambiguity: DateAmbiguity | null;
}

export interface TimelineItem {
  date: IsoDate;
  asWritten: string;
  ambiguity: DateAmbiguity | null;
  /** Rule titles that fired on the same paragraph ("Lock-in or minimum period"), for context. */
  topics: string[];
  /** The sentence the date appears in, citing its paragraph; quote is the date as written. */
  claim: GroundedClaim;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const MONTH =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const WEEKDAY = "(?:(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)day,?\\s+)?";
const ORDINAL = "(?:st|nd|rd|th)?";

/** "24th day of February 2026", "1 March 2026", "Friday, 25 September 2026", "the 5th of April, 2026". */
const DAY_FIRST = new RegExp(
  `\\b${WEEKDAY}(?:the\\s+)?(\\d{1,2})${ORDINAL}(?:\\s+day)?(?:\\s+of)?\\s+(${MONTH})\\.?,?\\s+(\\d{4})\\b`,
  "giu",
);
/** "February 24, 2026", "Sept. 5 2026". */
const MONTH_FIRST = new RegExp(`\\b${WEEKDAY}(${MONTH})\\.?\\s+(\\d{1,2})${ORDINAL},?\\s+(\\d{4})\\b`, "giu");
/** "24/02/2026", "24-02-26", "24.02.2026", "2026-02-24"; the three parts must share one separator. */
const NUMERIC = /(?<!\d|\d[./-])(\d{1,4})([./-])(\d{1,2})\2(\d{2,4})(?!\d|[./-]\d)/g;

const YEAR_MIN = 1900;
const YEAR_MAX = 2100;

function monthNumber(name: string): number | null {
  const key = name.toLowerCase();
  return MONTHS[key] ?? MONTHS[key.slice(0, 4)] ?? MONTHS[key.slice(0, 3)] ?? null;
}

function iso(year: number, month: number, day: number): IsoDate | null {
  if (year < YEAR_MIN || year > YEAR_MAX) return null;
  const value = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isIsoDate(value) ? value : null;
}

function textual(text: string, pattern: RegExp, dayIndex: number, monthIndex: number): DateMention[] {
  const found: DateMention[] = [];
  pattern.lastIndex = 0;
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    const monthName = match[monthIndex]!;
    // "may" as a verb ("the Company may 30 days later") is not followed by a four-digit year,
    // and both patterns demand one, so a lower-case "5 may 2026" is read as the date it is.
    const month = monthNumber(monthName);
    const date = month === null ? null : iso(Number(match[3]), month, Number(match[dayIndex]));
    if (date === null) continue;
    // "the" belongs to the sentence, not to the date as written.
    const lead = /^the\s+/i.exec(match[0])?.[0].length ?? 0;
    const start = match.index + lead;
    found.push({ date, asWritten: match[0].slice(lead), span: { start, end: match.index + match[0].length }, ambiguity: null });
  }
  return found;
}

function numeric(text: string): DateMention[] {
  const found: DateMention[] = [];
  NUMERIC.lastIndex = 0;
  for (let match = NUMERIC.exec(text); match !== null; match = NUMERIC.exec(text)) {
    const [asWritten, first, separator, second, third] = match;
    if (
      asWritten === undefined ||
      first === undefined ||
      separator === undefined ||
      second === undefined ||
      third === undefined
    ) {
      throw new Error("the numeric date pattern did not return its required captures");
    }
    const span = { start: match.index, end: match.index + asWritten.length };
    const mention = readNumeric(first, separator, second, third);
    if (mention) found.push({ ...mention, asWritten, span });
  }
  return found;
}

function readNumeric(
  first: string,
  separator: string,
  second: string,
  third: string,
): Pick<DateMention, "date" | "ambiguity"> | null {
  // Year first: 2026-02-24. A three-digit leading part is never a date (phone numbers, codes).
  if (first.length === 4) {
    if (third.length !== 2) return null;
    const date = iso(Number(first), Number(second), Number(third));
    return date ? { date, ambiguity: null } : null;
  }
  if (first.length === 3) return null;

  let year: number;
  const kinds: DateAmbiguityKind[] = [];
  if (third.length === 4) year = Number(third);
  else if (third.length === 2) {
    // "1.2.10" is a clause number far more often than a date; a dotted date with a two-digit
    // year is accepted only when the day and month are written with two digits too ("24.02.26").
    if (separator === "." && (first.length !== 2 || second.length !== 2)) return null;
    year = 2000 + Number(third);
    kinds.push("two-digit-year");
  } else return null;

  const a = Number(first);
  const b = Number(second);
  const dayFirst = iso(year, b, a);
  const monthFirst = iso(year, a, b);
  const swappable = dayFirst !== null && monthFirst !== null && a !== b;
  const date = dayFirst ?? monthFirst;
  if (!date) return null;
  if (swappable) kinds.unshift("day-month-order");
  if (kinds.length === 0) return { date, ambiguity: null };
  return { date, ambiguity: { kinds, alternative: swappable ? monthFirst : null } };
}

/** Every explicit date in one paragraph, in order of appearance, no overlaps. */
export function findDates(text: string): DateMention[] {
  const all = [...textual(text, DAY_FIRST, 1, 2), ...textual(text, MONTH_FIRST, 2, 1), ...numeric(text)].sort(
    (x, y) => x.span.start - y.span.start || y.span.end - x.span.end,
  );
  const kept: DateMention[] = [];
  for (const mention of all) {
    const last = kept.at(-1);
    if (last && mention.span.start < last.span.end) continue;
    kept.push(mention);
  }
  return kept;
}

/** Rule titles on a chunk, other than the date rule itself, in registry order and de-duplicated. */
function topicsFor(chunk: SourceChunk, hits: readonly RuleHit<SourceChunk>[]): string[] {
  const titles = hits
    .filter((hit) => hit.chunk.id === chunk.id && hit.category !== TIMELINE_CATEGORY)
    .map((hit) => hit.title);
  return [...new Set(titles)];
}

/**
 * The timeline for one document: every explicit date, earliest first, each
 * as a verbatim claim citing the paragraph it sits in. The same calendar
 * date named in two paragraphs is two items, because each paragraph says
 * something different happens on it.
 */
export function buildTimeline(chunks: readonly SourceChunk[], hits: readonly RuleHit<SourceChunk>[] = []): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const chunk of chunks) {
    const topics = topicsFor(chunk, hits);
    for (const mention of findDates(chunk.text)) {
      items.push({
        date: mention.date,
        asWritten: mention.asWritten,
        ambiguity: mention.ambiguity,
        topics,
        claim: verbatimClaim(chunk, mention.span, TIMELINE_CATEGORY, { quote: "match" }),
      });
    }
  }
  return items.sort((x, y) => x.date.localeCompare(y.date) || x.claim.location.paragraph - y.claim.location.paragraph);
}
