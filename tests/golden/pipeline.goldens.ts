import type { Stage } from "../support/api-server";

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
export const LINES_PER_PAGE = 40;
export const MOCK_MARKER = "Demo output (mock model, not analysis): ";
export const FIELD_IDS = ["parties", "dates", "money", "duties", "termination", "dispute"] as const;
type FieldId = (typeof FIELD_IDS)[number];
export type Relevance = "primary" | "secondary" | "background";

/** A cited paragraph: its 1-based index in the document and how it begins. */
type Cited = [paragraph: number, startsWith: string];
/** A prompt: the rule, the paragraph its question rests on, every paragraph it lists as a place to look. */
export type PromptRow = [ruleId: string, restsOn: string, places: string[]];

export interface FixtureGolden {
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

export const OFFER_LETTER: FixtureGolden = {
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

export const RENTAL: FixtureGolden = {
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

export const NDA: FixtureGolden = {
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
export const COMPARE = {
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
