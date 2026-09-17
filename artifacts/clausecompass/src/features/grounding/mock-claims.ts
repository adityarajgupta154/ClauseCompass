import type { Claim, SourceChunk } from "@workspace/grounding";

/**
 * Hardcoded data for the SourceCard demo (dev route /dev/source-card), used
 * until the chunking and validator tasks produce real claims. Excerpts are
 * verbatim paragraphs of samples/offer-letter-synthetic.txt; paragraph numbers
 * are that file's blank-line-separated paragraph indices; page numbers assume
 * the four-page PDF layout of the same letter (15 paragraphs per page).
 */

function chunk(paragraph: number, clause: string, text: string): SourceChunk {
  return {
    id: `offer-letter:p${paragraph}`,
    text,
    location: { page: Math.ceil(paragraph / 15), paragraph, clause },
  };
}

export const MOCK_CHUNKS: SourceChunk[] = [
  chunk(
    19,
    "4.2",
    "4.2 During probation, either party may terminate this employment by giving fifteen (15) days' written notice or salary in lieu of notice. Your employment will be confirmed in writing at the end of the probation period; confirmation is not automatic.",
  ),
  chunk(
    24,
    "6.1",
    "6.1 The Company will invest in an eight (8) week induction and technical training programme for you, the cost of which the Company values at INR 2,00,000 (Rupees Two Lakh only).",
  ),
  chunk(
    25,
    "6.2",
    "6.2 In consideration of this investment, you agree to serve the Company for a minimum period of eighteen (18) months from your date of joining. If you resign or are terminated for cause before completing this period, you agree to repay the Company the training cost of INR 2,00,000 on a pro-rata basis for the unserved period, and the Company may adjust this amount against any dues payable to you, including your final settlement.",
  ),
  chunk(
    27,
    "7.1",
    "7.1 After confirmation, either party may terminate this employment by giving sixty (60) days' written notice. The Company may, at its discretion, accept a shorter notice period or pay salary in lieu of notice. You may not buy out your notice period without the Company's written consent.",
  ),
  chunk(
    34,
    "9.1",
    "9.1 For a period of twelve (12) months after your employment ends, you will not, without the Company's prior written consent, be employed by or provide services to any business in India that competes directly with the Company's products in the enterprise supply-chain software segment.",
  ),
  chunk(
    44,
    "13.1",
    "13.1 This offer is valid until 5:00 p.m. on Friday, 25 September 2026. To accept, please sign and return a scanned copy of this letter, together with the documents listed in Annexure B, to careers@verdantloom.example by that time. If we do not receive your acceptance by then, this offer will lapse automatically.",
  ),
];

export type MockCase = {
  id: string;
  /** What this case demonstrates, for the demo page heading. */
  label: string;
  topic: string;
  claim: Claim;
  defaultOpen?: boolean;
};

export const MOCK_CASES: MockCase[] = [
  {
    id: "single",
    label: "Grounded, one citation",
    topic: "Notice period",
    claim: {
      text: "Once you are confirmed, either you or the company must give 60 days' written notice to end the job. The company can accept less notice or pay salary instead; you cannot shorten it yourself without their written consent.",
      source_chunk_ids: ["offer-letter:p27"],
      location: { page: 2, paragraph: 27, clause: "7.1" },
      confidence: 0.94,
      category: "notice",
    },
  },
  {
    id: "multiple",
    label: "Grounded, two citations, opened by default",
    topic: "Money you may owe",
    defaultOpen: true,
    claim: {
      text: "The letter values your training at ₹2,00,000 and asks you to stay 18 months. If you leave earlier, or are dismissed for cause, it says you repay a share of that amount for the months not served, and the company may deduct it from your final settlement.",
      source_chunk_ids: ["offer-letter:p24", "offer-letter:p25"],
      location: { page: 2, paragraph: 24, clause: "6.1" },
      confidence: 0.9,
      category: "money",
    },
  },
  {
    id: "low-confidence",
    label: "Grounded, weak match",
    topic: "After you leave",
    claim: {
      text: "For 12 months after leaving, the letter restricts you from working for a direct competitor in enterprise supply-chain software in India without written consent.",
      source_chunk_ids: ["offer-letter:p34"],
      location: { page: 3, paragraph: 34, clause: "9.1" },
      confidence: 0.41,
      category: "restriction",
    },
  },
  {
    id: "empty",
    label: "Ungrounded: empty source_chunk_ids (must show the fallback, not the claim)",
    topic: "Probation",
    claim: {
      text: "Your probation will be reviewed after 30 days and confirmation is usually automatic.",
      source_chunk_ids: [],
      location: null,
      confidence: 0.88,
      category: "probation",
    },
  },
  {
    id: "unresolved",
    label: "Ungrounded: cited chunk id does not exist",
    topic: "Deadline",
    claim: {
      text: "You have until 30 September 2026 to accept this offer.",
      source_chunk_ids: ["offer-letter:p99"],
      location: { page: 4, paragraph: 99, clause: null },
      confidence: 0.8,
      category: "deadline",
    },
  },
  {
    id: "invalid",
    label: "Ungrounded: malformed claim object (empty text, confidence out of range)",
    topic: "Salary",
    // Deliberately wrong shape, cast so the demo can exercise the runtime check.
    claim: { text: "", source_chunk_ids: ["offer-letter:p24"], location: null, confidence: 1.4, category: "money" } as Claim,
  },
  {
    id: "partial",
    label: "Grounded, one citation resolves and one does not (the gap is reported, not hidden)",
    topic: "Ending the job during probation",
    claim: {
      text: "During probation, either side can end the job with 15 days' notice or salary in lieu; confirmation at the end of probation is not automatic.",
      source_chunk_ids: ["offer-letter:p19", "offer-letter:p20"],
      location: { page: 2, paragraph: 19, clause: "4.2" },
      confidence: 0.86,
      category: "probation",
    },
  },
];
