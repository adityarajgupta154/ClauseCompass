import { isHeading, type SourceChunk } from "@workspace/grounding";
import type { Span } from "./verbatim";

/**
 * Where a document names its parties (PRD FR-04 "parties"). Agreements
 * introduce them with a defined term — `hereinafter called the "LICENSOR"`,
 * `(the "Receiving Party")`, `of the ONE PART` — usually in the paragraphs
 * right after the BETWEEN / AND headings; letters name the company with a
 * defined term in the opening line and the person in the address block and
 * the acceptance line. These cues pick the paragraphs the model may
 * describe; a document that names nobody this way gets "not found", not a
 * guess from the letterhead.
 */

export const PARTIES_CATEGORY = "parties";

/** How many paragraphs the model is shown for this field. */
export const MAX_PARTY_CHUNKS = 4;

const PARTY_TERMS = [
  "Company",
  "Employer",
  "Employee",
  "Licensor",
  "Licensee",
  "Lessor",
  "Lessee",
  "Landlord",
  "Tenant",
  "Owner",
  "Occupant",
  "Disclosing Party",
  "Receiving Party",
  "First Party",
  "Second Party",
  "Party",
  "Parties",
  "Borrower",
  "Lender",
  "Bank",
  "Client",
  "Consultant",
  "Contractor",
  "Service Provider",
  "Vendor",
  "Supplier",
  "Customer",
  "Buyer",
  "Seller",
  "Purchaser",
  "Franchisor",
  "Franchisee",
  "Principal",
  "Agent",
  "Guarantor",
  "Developer",
  "Promoter",
  "Allottee",
  "Builder",
  "Society",
  "Member",
].join("|");

interface Cue {
  pattern: RegExp;
  /** How strongly the cue marks a party paragraph; higher wins the cap. */
  weight: number;
}

const QUOTE = `["\u201c\u201d']`;

const CUES: Cue[] = [
  { pattern: /\bhereinafter\s+(?:called|referred\s+to\s+as|referred\s+as)\b/i, weight: 3 },
  { pattern: /\bof\s+the\s+(?:one|other|first|second|third)\s+part\b/i, weight: 3 },
  { pattern: new RegExp(`\\(\\s*(?:the\\s+)?${QUOTE}(?:the\\s+)?(?:${PARTY_TERMS})${QUOTE}\\s*\\)`, "i"), weight: 3 },
  { pattern: new RegExp(`\\(\\s*${QUOTE}(?:${PARTY_TERMS})${QUOTE}\\s*\\)`, "i"), weight: 3 },
  // "between X and Y" in a single opening sentence ("made between Mr A and Ms B").
  { pattern: /\b(?:made|entered\s+into|executed)\s+(?:at\s+\S+\s+)?(?:on\s+[^,]{1,40}\s+)?between\b/i, weight: 2 },
  // The address block a letter opens with: "Ms. Aarohi Menon 14, Lakeview Enclave ...", no sentence in it.
  { pattern: /^(?:Mr|Ms|Mrs|Miss|Dr|Shri|Smt|Sri|Kum|M\/s)\.?\s+\p{Lu}[^.!?]{2,160}$/u, weight: 1 },
  // A signed acceptance: "I, Aarohi Menon, have read and understood ...".
  { pattern: /^I,\s+[^,]{2,60},\s+(?:have\s+read|accept|agree|confirm|acknowledge)\b/i, weight: 1 },
];

/** A heading that introduces the party paragraph that follows it. */
const INTRODUCES_PARTY = /^(?:between|and|by\s+and\s+between|among|parties)\s*:?$/i;

export interface PartyMention {
  chunk: SourceChunk;
  /** The strongest cue's match, for a verbatim claim when no restatement exists. */
  match: Span;
  weight: number;
}

/**
 * Paragraphs that name a party, strongest cue first and document order
 * within a weight, at most MAX_PARTY_CHUNKS of them.
 */
export function findPartyChunks(chunks: readonly SourceChunk[]): PartyMention[] {
  const found: PartyMention[] = [];
  chunks.forEach((chunk, index) => {
    const text = chunk.text;
    if (text.trim() === "" || isHeading(text)) return;
    const candidates: PartyMention[] = [];
    for (const cue of CUES) {
      const match = cue.pattern.exec(text);
      if (match) candidates.push({ chunk, match: { start: match.index, end: match.index + match[0].length }, weight: cue.weight });
    }
    const previous = index > 0 ? chunks[index - 1]!.text.trim() : "";
    if (INTRODUCES_PARTY.test(previous) && isHeading(previous)) {
      candidates.push({ chunk, match: firstWords(text), weight: 2 });
    }
    const best = candidates.reduce<PartyMention | null>((top, next) => (top && top.weight >= next.weight ? top : next), null);
    if (best) found.push(best);
  });
  return found
    .sort((x, y) => y.weight - x.weight || x.chunk.location.paragraph - y.chunk.location.paragraph)
    .slice(0, MAX_PARTY_CHUNKS);
}

/** The opening words of a paragraph, as the span a verbatim claim would quote. */
function firstWords(text: string, count = 8): Span {
  const words = text.split(/\s+/).slice(0, count).join(" ");
  const start = text.indexOf(words);
  return { start: Math.max(0, start), end: Math.max(0, start) + words.length };
}
