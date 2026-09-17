import { readFileSync } from "node:fs";
import { RULE_REGISTRY } from "@workspace/rules";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { splitParagraphs } from "../../artifacts/api-server/src/extraction/paragraphs";
import { makeDocx } from "../../artifacts/api-server/src/testing/make-docx";
import { makePdf, type MadePdf } from "../../artifacts/api-server/src/testing/make-pdf";
import { bootApi, openSession, prepare, type Stage, type TestApi } from "../support/api-server";

/**
 * Golden documents through the whole pipeline (PRD section 12): each synthetic
 * fixture is uploaded to the real API the way the browser sends it, as the
 * committed text and as a PDF and a DOCX generated from that text, and the
 * Document Map, Timeline and Review Prompts it gets back are checked against
 * values written by hand from the fixtures. The comparison pair goes through
 * the compare route the same way.
 *
 * What is pinned literally is what the product decides on its own: which
 * paragraph every field, date and prompt points at (clause label, 1-based
 * paragraph, page in the PDF, and how the paragraph begins, so a reader can
 * check the row against the file), every date on the timeline as written,
 * which rules fired and which were reported missing, and every difference
 * between the two rental drafts. The model is the mock, so the wording of a
 * statement is checked for shape only: it must quote its cited paragraph
 * verbatim and carry the mock's marker. The function-level goldens beside
 * this file pin the same selections without the HTTP layer; this suite adds
 * real extraction, page numbers and the promise that all three formats of
 * one document read the same.
 *
 * Any change to these tables is a change to what a reader sees for these
 * documents and should be reviewed as one.
 *
 * Explanations: every prompt's title, why-it-matters text and category
 * must be the registry's own for that rule, and every statement's location
 * must be its cited paragraph's, so what the reader sees beside a citation
 * is exactly what the citation says.
 */

/** Lines a page in the generated PDFs. At this height the NDA's signature block lands alone on the last page. */
const LINES_PER_PAGE = 40;
const MOCK_MARKER = "Demo output (mock model, not analysis): ";
const FIELD_IDS = ["parties", "dates", "money", "duties", "termination", "dispute"] as const;
type FieldId = (typeof FIELD_IDS)[number];
type Relevance = "primary" | "secondary" | "background";

/** A cited paragraph: its 1-based index in the document and how it begins. */
type Cited = [paragraph: number, startsWith: string];
/** A prompt: the rule, the paragraph its question rests on, every paragraph it lists as a place to look. */
type PromptRow = [ruleId: string, restsOn: string, places: string[]];

interface FixtureGolden {
  id: string;
  file: string;
  stage: Stage;
  paragraphCount: number;
  wordCount: number;
  /** The first paragraph on each page when printed at LINES_PER_PAGE lines a page. */
  pdfPageStarts: number[];
  /** Every paragraph cited below, by the label the product shows (the clause number, or the chunk id for unnumbered text). */
  cited: Record<string, Cited>;
  evidence: Record<FieldId, string[]>;
  /** Each date in order: ISO date, the wording it was read from, the paragraph, and the topics (rule titles) that paragraph raises. */
  timeline: Array<[date: string, asWritten: string, label: string, topics: string[]]>;
  prompts: Record<Relevance, PromptRow[]>;
  notFound: string[];
}

const OFFER_LETTER: FixtureGolden = {
  id: "offer-letter",
  file: "offer-letter-synthetic.txt",
  stage: "before-signing",
  paragraphCount: 56,
  wordCount: 1397,
  pdfPageStarts: [1, 14, 25, 34, 45],
  cited: {
    p3: [3, "Reference: VLS/HR/OL/2026/0417 Date: 12 September 2026"],
    p4: [4, "Ms. Aarohi Menon 14, Lakeview Enclave, 2nd Cross Kochi 682017, Kerala"],
    p7: [7, "Further to your interviews with us, we are pleased to offer you"],
    "1.1": [9, "1.1 You will be employed as Software Engineer I"],
    "1.2": [10, "1.2 Your initial place of work will be the Company's Bengaluru office."],
    "2.1": [12, "2.1 Your expected date of joining is Monday, 5 October 2026."],
    "3.1": [14, "3.1 Your total annual cost to company (CTC) will be INR 8,40,000"],
    "3.2": [15, "3.2 The variable component described in Annexure A is discretionary"],
    "3.3": [16, "3.3 Your compensation will be reviewed annually in April."],
    "4.1": [18, "4.1 You will be on probation for a period of six (6) months"],
    "4.2": [19, "4.2 During probation, either party may terminate this employment"],
    "5.1": [21, "5.1 Normal working hours are 9:30 a.m. to 6:30 p.m., Monday to Friday"],
    "5.2": [22, "5.2 You will be entitled to eighteen (18) days of earned leave"],
    "6.1": [24, "6.1 The Company will invest in an eight (8) week induction"],
    "6.2": [25, "6.2 In consideration of this investment, you agree to serve the Company"],
    "7.1": [27, "7.1 After confirmation, either party may terminate this employment"],
    "7.2": [28, "7.2 The Company may terminate your employment immediately, without notice"],
    "7.3": [29, "7.3 On termination for any reason, you must return all Company property"],
    "8.1": [31, "8.1 You will keep confidential all non-public information"],
    "8.2": [32, "8.2 All work product, inventions, code and materials created by you"],
    "9.1": [34, "9.1 For a period of twelve (12) months after your employment ends"],
    "9.2": [35, "9.2 For a period of twelve (12) months after your employment ends"],
    "10.1": [37, "10.1 This offer and your continued employment are conditional"],
    "11.1": [39, "11.1 You consent to the Company collecting and processing your personal"],
    "11.2": [40, "11.2 Company devices, email accounts and network access"],
    "12.1": [42, "12.1 This letter is governed by the laws of India. The courts at Bengaluru"],
    "13.1": [44, "13.1 This offer is valid until 5:00 p.m. on Friday, 25 September 2026."],
    "13.2": [45, "13.2 This letter, together with the Company's policies as amended"],
    p50: [50, "I, Aarohi Menon, have read and understood the terms of this letter"],
    p53: [53, "Basic salary: 3,36,000 House rent allowance: 1,68,000"],
    p54: [54, "Note: The Company may restructure the components above at any time"],
  },
  evidence: {
    parties: ["p4", "p7", "p50"],
    dates: ["p3", "2.1", "4.1", "6.2", "9.1", "13.1"],
    money: ["3.1", "3.2", "3.3", "6.1", "6.2", "p53"],
    duties: ["1.1", "1.2", "4.1", "5.1", "5.2", "7.1"],
    termination: ["4.2", "6.2", "7.1", "7.2", "7.3", "10.1"],
    dispute: ["12.1"],
  },
  timeline: [
    ["2026-09-12", "12 September 2026", "p3", []],
    ["2026-09-25", "Friday, 25 September 2026", "13.1", ["A time limit for doing something"]],
    ["2026-10-05", "Monday, 5 October 2026", "2.1", ["A time limit for doing something"]],
  ],
  prompts: {
    primary: [
      ["duty.non-compete", "9.1", ["9.1"]],
      ["duty.non-solicit", "9.2", ["9.2"]],
      ["duty.one-sided", "1.1", ["1.1", "1.2", "4.1", "5.2", "7.1", "13.2", "p54"]],
      ["duty.hours", "5.1", ["5.1", "5.2"]],
      ["duty.conditions", "10.1", ["10.1"]],
      ["time.term", "4.1", ["4.1", "6.2", "9.1", "9.2"]],
      ["time.probation", "4.1", ["4.1", "4.2", "7.1"]],
      ["time.survival", "8.1", ["8.1", "9.1", "9.2"]],
      ["exit.notice", "4.2", ["4.2", "7.1", "7.2", "10.1"]],
      ["exit.termination", "4.2", ["4.2", "7.1", "7.2", "10.1"]],
      ["exit.lock-in", "6.2", ["6.2"]],
      ["money.payment-terms", "3.1", ["3.1", "p53"]],
      ["money.bond-repayment", "6.1", ["6.1", "6.2"]],
      ["money.discretionary", "3.2", ["3.2", "3.3", "p54"]],
      ["data-ip.confidentiality", "7.2", ["7.2", "8.1"]],
      ["data-ip.ip", "8.1", ["8.1", "8.2"]],
      ["data-ip.personal-data", "11.1", ["11.1"]],
      ["data-ip.monitoring", "11.2", ["11.2"]],
    ],
    secondary: [
      ["duty.restrictions", "7.1", ["7.1", "9.1", "9.2"]],
      ["time.deadline", "2.1", ["2.1", "3.1", "7.3", "13.1"]],
      ["exit.handover", "7.3", ["7.3"]],
      ["exit.disputes", "12.1", ["12.1"]],
    ],
    background: [["time.dated", "p3", ["p3", "2.1", "13.1"]]],
  },
  notFound: ["duty.one-way", "time.renewal", "exit.remedies", "exit.liability", "money.deposit", "money.late-fees", "data-ip.handling"],
};

const RENTAL: FixtureGolden = {
  id: "rental-agreement",
  file: "rental-agreement-synthetic.txt",
  stage: "problem-started",
  paragraphCount: 53,
  wordCount: 1574,
  pdfPageStarts: [1, 13, 23, 33, 43],
  cited: {
    p3: [3, 'This Leave and Licence Agreement ("Agreement") is made at Pune on this 24th day of February 2026'],
    p5: [5, "Mr. Devraj Kulkarni, aged about 58 years"],
    p7: [7, "Mr. Imran Qureshi, aged about 31 years"],
    "1.1": [12, "1.1 The Licensor hereby grants to the Licensee a licence to use and occupy"],
    "1.2": [13, "1.2 The Licence Period shall not be extended automatically."],
    "2.1": [15, "2.1 The Licensee shall pay to the Licensor a monthly licence fee of Rs."],
    "2.2": [16, "2.2 If the licence fee is not received by the 5th day of the month"],
    "2.3": [17, "2.3 The Licensee shall pay the monthly society maintenance charges"],
    "3.1": [19, "3.1 The Licensee has, on or before the execution of this Agreement, paid"],
    "3.2": [20, "3.2 The security deposit shall be refunded by the Licensor to the Licensee"],
    "3.3": [21, "3.3 The security deposit shall not be adjusted against the licence fee"],
    "4.1": [23, "4.1 The first six (6) months of the Licence Period, that is, from 1 March 2026"],
    "4.2": [24, "4.2 After the lock-in period, either party may terminate this Agreement"],
    "4.3": [25, "4.3 Notwithstanding anything contained above, the Licensor may terminate"],
    "5.1": [27, "5.1 The Licensee shall use the Licensed Premises for the residence"],
    "5.2": [28, "5.2 The Licensee shall not sub-let, assign, or part with possession"],
    "5.3": [29, "5.3 The Licensee shall not carry out any structural alteration"],
    "5.4": [30, "5.4 The Licensee shall not keep pets in the Licensed Premises"],
    "6.1": [33, "6.1 The Licensed Premises are handed over with the fittings and fixtures"],
    "6.2": [34, "6.2 Day-to-day minor repairs, including replacement of bulbs, tap washers"],
    "7.1": [36, "7.1 The Licensor or his authorised representative may enter and inspect"],
    "9.1": [40, "9.1 On expiry or earlier termination of this Agreement, the Licensee shall"],
    "10.1": [42, "10.1 This Agreement shall be registered with the Sub-Registrar of Assurances"],
    "11.1": [44, "11.1 Any notice under this Agreement shall be in writing"],
    "12.1": [47, "12.1 This Agreement shall be governed by the laws of India. Any dispute"],
  },
  evidence: {
    parties: ["p5", "p7"],
    dates: ["p3", "1.1", "1.2", "2.1", "2.2", "4.1"],
    money: ["2.1", "2.2", "3.1", "3.2", "3.3", "4.1"],
    duties: ["3.2", "5.1", "5.2", "6.1", "6.2", "9.1"],
    termination: ["3.2", "4.1", "4.2", "4.3", "9.1", "11.1"],
    dispute: ["12.1"],
  },
  timeline: [
    ["2026-02-24", "24th day of February 2026", "p3", []],
    ["2026-03-01", "1 March 2026", "1.1", ["A fixed period of time"]],
    ["2026-03-01", "1 March 2026", "4.1", ["Deposit, its refund and deductions", "Lock-in or minimum period", "What must be handed back at the end"]],
    ["2026-08-31", "31 August 2026", "4.1", ["Deposit, its refund and deductions", "Lock-in or minimum period", "What must be handed back at the end"]],
    ["2027-01-31", "31 January 2027", "1.1", ["A fixed period of time"]],
  ],
  prompts: {
    primary: [
      ["exit.notice", "4.2", ["4.2", "4.3"]],
      ["exit.notice-service", "11.1", ["11.1"]],
      ["exit.termination", "4.2", ["4.2", "4.3"]],
      ["exit.lock-in", "4.1", ["4.1", "4.2"]],
      ["exit.handover", "3.2", ["3.2", "4.1", "9.1"]],
      ["exit.remedies", "9.1", ["9.1"]],
      ["exit.disputes", "12.1", ["12.1"]],
      ["time.deadline", "1.2", ["1.2", "2.1", "2.2", "3.1", "3.2", "4.3", "7.1", "10.1"]],
      ["time.dated", "p3", ["p3", "1.1", "4.1"]],
      ["money.deposit", "3.1", ["3.1", "3.2", "3.3", "4.1"]],
      ["money.late-fees", "2.2", ["2.2"]],
      ["duty.upkeep", "3.2", ["3.2", "6.1", "6.2", "9.1"]],
    ],
    secondary: [
      ["time.term", "1.1", ["1.1"]],
      ["time.renewal", "1.2", ["1.2"]],
      ["money.payment-terms", "2.1", ["2.1", "2.3"]],
      ["money.who-pays", "2.3", ["2.3", "3.2", "10.1"]],
      ["duty.restrictions", "5.1", ["5.1", "5.2", "5.3", "5.4", "7.1"]],
      ["duty.conditions", "10.1", ["10.1"]],
      ["data-ip.monitoring", "7.1", ["7.1"]],
    ],
    background: [],
  },
  notFound: ["exit.liability", "money.bond-repayment", "data-ip.incident"],
};

const NDA: FixtureGolden = {
  id: "nda",
  file: "nda-synthetic.txt",
  stage: "before-signing",
  paragraphCount: 53,
  wordCount: 1495,
  pdfPageStarts: [1, 14, 21, 30, 39, 50],
  cited: {
    p3: [3, 'This Confidentiality and Non-Disclosure Agreement ("Agreement") is entered into'],
    p5: [5, "Halcyon Grid Consulting LLP, a limited liability partnership"],
    p7: [7, "Mr. Kabir Anand, an independent software consultant"],
    B: [11, "B. In connection with the Purpose, the Disclosing Party may disclose"],
    "1.1": [14, '1.1 "Confidential Information" means'],
    "1.2": [15, "1.2 Confidential Information does not include information"],
    "1.3": [16, '1.3 "Trade Secrets" means that part of the Confidential Information'],
    "2.1": [18, "2.1 The Receiving Party shall use the Confidential Information solely"],
    "2.2": [19, "2.2 The Receiving Party shall hold the Confidential Information in strict"],
    "2.3": [20, "2.3 The Receiving Party shall protect the Confidential Information using"],
    "2.4": [21, "2.4 The Receiving Party shall notify the Disclosing Party in writing"],
    "2.5": [22, "2.5 If the Receiving Party is required by law, regulation or court order"],
    "3.1": [24, "3.1 Nothing in this Agreement obliges the Disclosing Party to disclose"],
    "3.2": [25, "3.2 This Agreement is one-way. The Disclosing Party has no confidentiality"],
    "4.1": [27, "4.1 This Agreement commences on the Effective Date and continues for three"],
    "4.2": [28, "4.2 The Receiving Party's obligations in respect of Confidential Information"],
    "5.1": [30, "5.1 Within seven (7) days of the Disclosing Party's written request"],
    "6.1": [32, "6.1 During the term of this Agreement and for twelve (12) months thereafter"],
    "7.1": [34, "7.1 All Confidential Information remains the sole property of the Disclosing"],
    "8.1": [36, "8.1 The Receiving Party acknowledges that any breach of this Agreement"],
    "8.2": [37, "8.2 In the event of any unauthorised disclosure"],
    "8.3": [38, "8.3 The Receiving Party shall indemnify and hold harmless the Disclosing Party"],
    "9.1": [40, "9.1 This Agreement shall be governed by and construed in accordance with"],
    "9.2": [41, "9.2 Any dispute arising out of or in connection with this Agreement shall"],
    "9.3": [42, "9.3 Subject to Clause 9.2, the courts at New Delhi shall have exclusive"],
    "10.2": [45, "10.2 The Disclosing Party may assign this Agreement to any affiliate"],
    "10.5": [48, "10.5 Notices shall be sent in writing by e-mail with confirmation of receipt"],
    p51: [51, "Sd/- Name: Ritika Sabharwal Designation: Designated Partner Date: 20 September 2026"],
  },
  evidence: {
    parties: ["p5", "p7"],
    dates: ["p3", "2.4", "4.1", "4.2", "5.1", "p51"],
    money: ["9.2"],
    duties: ["2.1", "2.2", "3.2", "6.1", "10.2"],
    termination: ["4.1", "5.1", "10.5"],
    dispute: ["9.1", "9.2", "9.3"],
  },
  timeline: [
    ["2026-09-20", "20 September 2026", "p3", []],
    ["2026-09-20", "20 September 2026", "p51", []],
  ],
  prompts: {
    primary: [
      ["duty.non-solicit", "6.1", ["6.1"]],
      ["duty.one-sided", "10.2", ["10.2"]],
      ["duty.one-way", "3.2", ["3.2"]],
      ["time.term", "4.1", ["4.1", "4.2"]],
      ["time.survival", "4.2", ["4.2"]],
      ["exit.notice", "4.1", ["4.1"]],
      ["exit.termination", "4.1", ["4.1"]],
      ["exit.remedies", "8.1", ["8.1", "8.2", "8.3"]],
      ["data-ip.confidentiality", "B", ["B", "1.1", "1.2", "1.3", "2.1", "2.2", "2.3", "2.4", "2.5", "3.1", "3.2", "4.2", "5.1", "6.1", "7.1", "8.2"]],
      ["data-ip.ip", "7.1", ["7.1"]],
      ["data-ip.handling", "2.3", ["2.3", "5.1"]],
    ],
    secondary: [
      ["duty.restrictions", "2.1", ["2.1", "2.2", "6.1", "10.2"]],
      ["time.deadline", "2.4", ["2.4", "5.1"]],
      ["exit.notice-service", "10.5", ["10.5"]],
      ["exit.handover", "5.1", ["5.1"]],
      ["exit.disputes", "9.1", ["9.1", "9.2", "9.3"]],
      ["money.who-pays", "9.2", ["9.2"]],
      ["data-ip.incident", "2.4", ["2.4", "2.5"]],
    ],
    background: [["time.dated", "p3", ["p3", "p51"]]],
  },
  notFound: [
    "duty.non-compete",
    "duty.hours",
    "duty.conditions",
    "time.renewal",
    "time.probation",
    "exit.lock-in",
    "exit.liability",
    "money.payment-terms",
    "money.deposit",
    "money.late-fees",
    "money.bond-repayment",
    "money.discretionary",
    "data-ip.personal-data",
    "data-ip.monitoring",
  ],
};

/**
 * The rental agreement against its second draft (samples/manifest.json: the
 * comparison pair). Every difference between the drafts, in document order,
 * with the paragraph it sits at in each version (the second draft drops
 * clause 3.3, so everything after it moves up one) and the words that
 * differ, as written.
 */
const COMPARE = {
  older: RENTAL,
  newer: { id: "rental-agreement-v2", file: "rental-agreement-v2-synthetic.txt", paragraphCount: 53, wordCount: 1577 },
  aligned: 52,
  unchanged: 47,
  byKind: { money: 2, time: 1, duty: 2, remedy: 1, wording: 1 },
  changes: [
    { id: "c1", status: "changed", kind: "wording", signals: [], older: ["2.1", 15], newer: ["2.1", 15], values: { older: [], newer: [] }, olderWords: [], newerWords: ["or UPI"] },
    {
      id: "c2",
      status: "changed",
      kind: "money",
      signals: ["money"],
      older: ["2.2", 16],
      newer: ["2.2", 16],
      values: { older: ["Rs. 200/-", "Rupees Two Hundred only"], newer: ["Rs. 500/-", "Rupees Five Hundred only"] },
      olderWords: ["200/-", "Two"],
      newerWords: ["500/-", "Five"],
    },
    {
      id: "c3",
      status: "removed",
      kind: "money",
      signals: ["money", "duty"],
      older: ["3.3", 21],
      newer: null,
      values: { older: ["deposit", "licence fee"], newer: [] },
      olderWords: ["3.3 The security deposit shall not be adjusted against the licence fee for the last month or any other month of the Licence Period."],
      newerWords: null,
    },
    {
      id: "c4",
      status: "changed",
      kind: "time",
      signals: ["time"],
      older: ["4.2", 24],
      newer: ["4.2", 23],
      values: { older: ["one (1) month's", "one month's"], newer: ["two (2) months'", "two months'"] },
      olderWords: ["one (1) month's", "one month's"],
      newerWords: ["two (2) months'", "two months'"],
    },
    {
      id: "c5",
      status: "changed",
      kind: "remedy",
      signals: ["remedy", "money", "duty"],
      older: ["4.3", 25],
      newer: ["4.3", 24],
      values: { older: [], newer: ["forfeit"] },
      olderWords: [],
      newerWords: ["and in that case the Licensor may forfeit the security deposit."],
    },
    {
      id: "c6",
      status: "changed",
      kind: "duty",
      signals: ["duty"],
      older: ["5.4", 30],
      newer: ["5.4", 29],
      values: { older: ["consent"], newer: [] },
      olderWords: ["without the prior written consent of the Licensor and the society."],
      newerWords: [],
    },
    {
      id: "c7",
      status: "added",
      kind: "duty",
      signals: ["duty", "time"],
      older: null,
      newer: ["5.6", 31],
      values: { older: [], newer: ["shall not"] },
      olderWords: null,
      newerWords: ["5.6 The Licensee shall not park more than one two-wheeler in the allotted parking slot, and shall not park any four-wheeler within the society premises."],
    },
  ],
  /** The map the compare journey shows is built from the newer draft at the compare stage. */
  newerEvidence: {
    parties: ["p5", "p7"],
    dates: ["p3", "1.1", "1.2", "2.1", "2.2", "4.1"],
    money: ["2.1", "2.2", "2.3", "3.1", "3.2", "4.1"],
    duties: ["5.1", "5.2", "5.3", "5.4", "5.6", "7.1"],
    termination: ["3.2", "4.1", "4.2", "4.3", "9.1", "11.1"],
    dispute: ["12.1"],
  } satisfies Record<FieldId, string[]>,
  newerParagraphs: { "4.1": 22, "4.2": 23, "4.3": 24, "5.4": 29, "5.6": 31 } as Record<string, number>,
};

// ---------------------------------------------------------------------------
// Response shapes, as far as this suite reads them.

interface Location {
  page: number | null;
  paragraph: number;
  clause: string | null;
}
interface Chunk {
  id: string;
  text: string;
  location: Location;
}
interface Claim {
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
interface DocumentMeta {
  kind: string;
  pageCount: number | null;
  wordCount: number;
  paragraphCount: number;
}
interface MapResponse {
  document: DocumentMeta;
  chunks: Chunk[];
  map: { fields: MapField[] };
  timeline: { items: Array<{ date: string; asWritten: string; ambiguity: unknown; claim: Claim; topics: string[] }> };
}
interface ReviewResponse {
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
interface CompareSide {
  chunkId: string;
  location: Location;
  segments: Array<{ text: string; changed: boolean }>;
}
interface CompareResponse {
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

type Format = "txt" | "pdf" | "docx";
interface Rendering {
  format: Format;
  fileName: string;
  bytes: Uint8Array;
  /** Page each paragraph was printed on (1-based paragraph index → page); PDF only. */
  pageOf: (paragraph: number) => number | null;
  pdf?: MadePdf;
}

function render(file: string, format: Format): Rendering {
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
const labelOf = (chunk: Chunk): string => chunk.location.clause ?? chunk.id;

function chunkByLabel(chunks: Chunk[], label: string): Chunk {
  const matches = chunks.filter((chunk) => labelOf(chunk) === label);
  expect(matches, `exactly one chunk labelled "${label}"`).toHaveLength(1);
  return matches[0]!;
}

function labelsOf(chunks: Chunk[], ids: string[]): string[] {
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
function expectGrounded(claim: Claim, chunks: Chunk[], phrasedBy: "model" | "document" | "template" = "model"): Chunk {
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

function expectDocument(meta: DocumentMeta, golden: { paragraphCount: number; wordCount: number }, rendering: Rendering) {
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

function expectMap(body: MapResponse, golden: FixtureGolden, rendering: Rendering) {
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

function expectReview(body: ReviewResponse, golden: FixtureGolden, rendering: Rendering) {
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
function withoutPages<T>(body: T): T {
  return JSON.parse(JSON.stringify(body, (key, value) => (key === "page" ? null : value))) as T;
}

let api: TestApi;
beforeAll(async () => {
  api = await bootApi();
});
afterAll(() => api.close());

async function run(golden: FixtureGolden, format: Format) {
  const rendering = render(golden.file, format);
  const id = await openSession(api.baseUrl, golden.stage, { fileName: rendering.fileName, bytes: rendering.bytes });
  const map = await prepare(api.baseUrl, id, "document-map");
  const review = await prepare(api.baseUrl, id, "review-prompts");
  expect([map.status, review.status]).toEqual([200, 200]);
  return { rendering, map: JSON.parse(map.body) as MapResponse, review: JSON.parse(review.body) as ReviewResponse };
}

for (const golden of [OFFER_LETTER, RENTAL, NDA]) {
  describe(`${golden.id} (${golden.stage})`, () => {
    // The committed text is the reference the other two formats are held to; run once, shared.
    let asText: ReturnType<typeof run> | undefined;
    const reference = () => (asText ??= run(golden, "txt"));

    it("as the committed text: every field, date and prompt points at the paragraph the table says", async () => {
      const result = await reference();
      expectMap(result.map, golden, result.rendering);
      expectReview(result.review, golden, result.rendering);
    });

    for (const format of ["pdf", "docx"] as const) {
      it(`as ${format.toUpperCase()}: reads the same, ${format === "pdf" ? "with the page each paragraph was printed on" : "with no pages"}`, async () => {
        const [result, text] = await Promise.all([run(golden, format), reference()]);
        expectMap(result.map, golden, result.rendering);
        expectReview(result.review, golden, result.rendering);
        const { document: _m, ...mapRest } = result.map;
        const { document: _r, ...reviewRest } = result.review;
        const { document: _rm, ...refMap } = text.map;
        const { document: _rr, ...refReview } = text.review;
        expect(withoutPages(mapRest)).toEqual(withoutPages(refMap));
        expect(withoutPages(reviewRest)).toEqual(withoutPages(refReview));
      });
    }
  });
}

describe("rental agreement against its second draft (compare-versions)", () => {
  async function runCompare(format: Format) {
    const older = render(COMPARE.older.file, format);
    const newer = render(COMPARE.newer.file, format);
    const id = await openSession(api.baseUrl, "compare-versions", { fileName: older.fileName, bytes: older.bytes }, { fileName: newer.fileName, bytes: newer.bytes });
    const compare = await prepare(api.baseUrl, id, "compare");
    expect(compare.status).toBe(200);
    return { id, older, newer, compare: JSON.parse(compare.body) as CompareResponse };
  }

  function expectCompare(body: CompareResponse, older: Rendering, newer: Rendering) {
    expectDocument(body.older.document, COMPARE.older, older);
    expectDocument(body.newer.document, COMPARE.newer, newer);
    expect([body.aligned, body.unchanged, body.byKind]).toEqual([COMPARE.aligned, COMPARE.unchanged, COMPARE.byKind]);

    const side = (chunks: Chunk[], rendering: Rendering, at: CompareSide | null) => {
      if (at === null) return null;
      const chunk = chunks.find((candidate) => candidate.id === at.chunkId);
      expect(chunk).toBeDefined();
      expect(at.location).toEqual(chunk!.location);
      expect(at.location.page).toBe(rendering.pageOf(at.location.paragraph));
      // The excerpt shown is the paragraph itself, in pieces.
      expect(at.segments.map((segment) => segment.text).join("")).toBe(chunk!.text);
      return [labelOf(chunk!), at.location.paragraph] as [string, number];
    };
    const words = (at: CompareSide | null) => (at === null ? null : at.segments.filter((segment) => segment.changed).map((segment) => segment.text.trim()));

    expect(
      body.changes.map((change) => ({
        id: change.id,
        status: change.status,
        kind: change.kind,
        signals: change.signals,
        older: side(body.older.chunks, older, change.older),
        newer: side(body.newer.chunks, newer, change.newer),
        values: change.values,
        olderWords: words(change.older),
        newerWords: words(change.newer),
      })),
    ).toEqual(COMPARE.changes);
  }

  it("finds the seven differences, each at its paragraph in both drafts, with the amounts and periods as written", async () => {
    const { id, older, newer, compare } = await runCompare("txt");
    expectCompare(compare, older, newer);

    // The map for this journey is built from the newer draft, at the compare stage.
    const map = await prepare(api.baseUrl, id, "document-map");
    expect(map.status).toBe(200);
    const body = JSON.parse(map.body) as MapResponse;
    expectDocument(body.document, COMPARE.newer, newer);
    expect(Object.fromEntries(body.map.fields.map((field) => [field.id, labelsOf(body.chunks, field.evidence)]))).toEqual(COMPARE.newerEvidence);
    for (const [label, paragraph] of Object.entries(COMPARE.newerParagraphs)) expect(chunkByLabel(body.chunks, label).location.paragraph, label).toBe(paragraph);
    for (const field of body.map.fields) for (const claim of field.claims) expectGrounded(claim, body.chunks);
  });

  it("as two PDFs: the same differences, each side on the page it was printed on", async () => {
    const asText = await runCompare("txt");
    const asPdf = await runCompare("pdf");
    expectCompare(asPdf.compare, asPdf.older, asPdf.newer);
    const { older: _o, newer: _n, ...pdfRest } = asPdf.compare;
    const { older: _to, newer: _tn, ...textRest } = asText.compare;
    expect(withoutPages(pdfRest)).toEqual(withoutPages(textRest));
    expect(asPdf.compare.changes.map((change) => [change.older?.location.page ?? null, change.newer?.location.page ?? null])).toEqual([
      [2, 2],
      [2, 2],
      [2, null],
      [3, 3],
      [3, 3],
      [3, 3],
      [null, 3],
    ]);
  });
});
