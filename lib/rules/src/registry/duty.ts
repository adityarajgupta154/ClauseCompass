import type { RuleRegistry } from "../schema";

/** Straight or typographic apostrophe; Word-produced documents use the curly one. */
const APOS = String.raw`['’]`;

export const DUTY_RULES: RuleRegistry["rules"] = [
  // ------------------------------------------------------------------ Duty
  {
    id: "duty.non-compete",
    family: "duty",
    category: "non-compete",
    title: "Limits on working elsewhere",
    whyItMatters: "A non-compete can shape your next job long after this one ends.",
    detection: {
      any: [
        String.raw`non-?compet(?:e|ition|ing)`,
        String.raw`\bcompet(?:ing|itor)s?\b`,
        String.raw`\bnot\b.{0,60}\bbe employed by\b`,
      ],
    },
    stages: {
      "before-signing": "primary",
      "problem-started": "secondary",
      "compare-versions": "secondary",
    },
    reviewPrompt:
      "{clause} limits where you can work afterwards. Check how long it lasts, what area or clients it covers, and whether anything is paid to you in return.",
  },
  {
    id: "duty.non-solicit",
    family: "duty",
    category: "non-solicit",
    title: "Limits on approaching clients or staff",
    whyItMatters: "Non-solicitation clauses can cover people and clients you knew before.",
    detection: {
      any: [String.raw`non-?solicit`, String.raw`\bsolicit\b`, String.raw`approach or provide services`],
    },
    stages: {
      "before-signing": "primary",
      "problem-started": "secondary",
      "compare-versions": "secondary",
    },
    reviewPrompt:
      "{clause} stops you approaching the other side's clients or staff. Check how long it lasts and whether it covers people you already knew.",
  },
  {
    id: "duty.restrictions",
    family: "duty",
    category: "restriction",
    title: "Things you must not do",
    whyItMatters: "The 'shall not' list is where everyday behaviour can become a breach.",
    detection: {
      any: [
        String.raw`\b(?:licensee|tenant|lessee|receiving party|employee|consultant|you|party|parties)\b[^.]{0,80}\b(?:shall|will|must|may) not\b`,
        String.raw`\bwithout (?:the )?prior written consent\b`,
        String.raw`\bfor no other purpose\b`,
        String.raw`\bsolely for\b`,
        String.raw`\bnot more than\b`,
      ],
    },
    stages: {
      "before-signing": "secondary",
      "problem-started": "secondary",
      "compare-versions": "secondary",
    },
    reviewPrompt:
      "{clause} restricts what you may do. Read it as a list of things that could count against you, and check each one fits how you actually plan to live or work.",
  },
  {
    id: "duty.one-sided",
    family: "duty",
    category: "one-sided",
    title: "Decisions the other side can make alone",
    whyItMatters: "Discretion clauses let terms change without your agreement.",
    detection: {
      any: [
        String.raw`\bat (?:its|his|her|their|the company${APOS}?s|the licensor${APOS}?s) (?:sole |absolute )?discretion\b`,
        String.raw`\bmay transfer you\b`,
        String.raw`\bsuch other (?:person|role|location|duties)\b`,
        String.raw`\bfrom time to time\b`,
        String.raw`\bwithout (?:the )?(?:receiving party${APOS}?s|licensee${APOS}?s|your) consent\b`,
        String.raw`\bmay (?:assign|amend|vary|restructure)\b`,
      ],
    },
    stages: {
      "before-signing": "primary",
      "problem-started": "secondary",
      "compare-versions": "primary",
    },
    reviewPrompt:
      "{clause} lets the other side change or decide something on their own. Ask what limits apply and how much notice you would get.",
  },
  {
    id: "duty.upkeep",
    family: "duty",
    category: "upkeep",
    title: "Repairs, upkeep and condition",
    whyItMatters: "Who pays for repairs, and the recorded condition at hand-over, decide most deposit disputes.",
    detection: {
      any: [
        String.raw`\brepairs?\b`,
        String.raw`\bmaintenance\b(?! charges)`,
        String.raw`wear and tear`,
        String.raw`good (?:working )?condition`,
        String.raw`\bfittings\b`,
      ],
      all: [String.raw`\b(?:shall|will|must|carried out|return)\b`],
    },
    stages: { "before-signing": "secondary", "problem-started": "primary" },
    documentTypes: ["rental"],
    reviewPrompt:
      "{clause} splits repairs and upkeep between you and the owner. Check who pays for what, and photograph the condition of everything on the day you move in.",
  },
  {
    id: "duty.hours",
    family: "duty",
    category: "hours",
    title: "Working hours, extra hours and leave",
    whyItMatters:
      "Hours and leave terms shape daily life more than most clauses, and extra hours are often unpaid by default.",
    detection: {
      any: [
        String.raw`\b(?:normal|regular|standard|office|usual) (?:working |business |office )?hours\b`,
        String.raw`\bhours of work\b`,
        String.raw`\badditional hours\b`,
        String.raw`\bovertime\b`,
        String.raw`\bwithout (?:any )?(?:additional|extra|further) (?:compensation|pay(?:ment)?|remuneration)\b`,
        String.raw`\b(?:earned|casual|sick|privilege|paid) leave\b`,
        String.raw`\bleave policy\b`,
      ],
    },
    stages: { "before-signing": "primary", "problem-started": "secondary", "compare-versions": "secondary" },
    documentTypes: ["offer_letter"],
    reviewPrompt:
      "{clause} sets working hours or leave. Check whether extra hours are expected, whether they are paid or compensated with time off, and how leave is counted in the first year.",
  },
  {
    id: "duty.one-way",
    family: "duty",
    category: "one-way",
    title: "Duties that run only one way",
    whyItMatters: "When only one side carries an obligation, what you share or do has no matching protection.",
    detection: {
      any: [
        String.raw`\bone-?way\b`,
        String.raw`\bunilateral\b`,
        String.raw`\bhas no [^.]{0,40}\bobligations?\b`,
        String.raw`\bno (?:reciprocal|corresponding|equivalent) (?:obligation|duty)s?\b`,
        String.raw`\bnot (?:be )?(?:mutual|reciprocal)\b`,
      ],
    },
    stages: { "before-signing": "primary", "problem-started": "secondary", "compare-versions": "secondary" },
    reviewPrompt:
      "{clause} places a duty on one side only. Check what you will be sharing or doing without the same protection coming back, and ask whether it can be made mutual.",
  },
  {
    id: "duty.conditions",
    family: "duty",
    category: "condition",
    title: "Conditions and formalities to be met",
    whyItMatters: "A check or registration that is never completed can undo the whole arrangement.",
    detection: {
      any: [
        String.raw`\bconditional (?:on|upon)\b`,
        String.raw`\bsubject to (?:satisfactory )?verification\b`,
        String.raw`police verification`,
        String.raw`\bsubmit\b.{0,60}\bdocuments?\b`,
        String.raw`\bregistered with\b`,
      ],
    },
    stages: { "before-signing": "primary", "problem-started": "secondary" },
    reviewPrompt:
      "{clause} makes something depend on a check or a formality. Find out what happens if it is not done, and who is responsible for doing it.",
  },
];
