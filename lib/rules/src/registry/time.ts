import type { RuleRegistry } from "../schema";

/** Written-out and numeric quantities as they appear in agreements: "thirty (30)", "24", "one (1)". */
const NUMBER = String.raw`(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen|fifteen|eighteen|twenty(?:-four)?|thirty|forty-five|sixty|ninety)`;
const UNIT = String.raw`(?:hours?|days?|weeks?|months?|years?)`;
const PERIOD = String.raw`${NUMBER}\s*(?:\(\s*\d+\s*\)\s*)?${UNIT}`;

export const TIME_RULES: RuleRegistry["rules"] = [
  // ------------------------------------------------------------------ Time
  {
    id: "time.term",
    family: "time",
    category: "term",
    title: "A fixed period of time",
    whyItMatters:
      "Every fixed period has an end date that drives other dates: notice, renewal, refunds, restrictions falling away.",
    detection: {
      any: [
        String.raw`\b(?:for a (?:term|period) of|period of|continues? for|valid for)\s+(?<period>${PERIOD})`,
        String.raw`\bcommenc(?:es|ing) (?:on|from)\b`,
      ],
    },
    stages: {
      "before-signing": "primary",
      "problem-started": "secondary",
      "compare-versions": "primary",
    },
    reviewPrompt:
      "{clause} fixes a period ({period|see the dates given}). Work out the exact start and end dates and put the end date in your calendar.",
  },
  {
    id: "time.deadline",
    family: "time",
    category: "deadline",
    title: "A time limit for doing something",
    whyItMatters: "Missing a stated window can cost money or a right, whichever side has to act.",
    detection: {
      any: [
        String.raw`\b(?:within|no later than|not later than|at least)\s+(?<window>${PERIOD})`,
        String.raw`\bon or before\b`,
        String.raw`\bvalid until\b`,
        String.raw`\bby (?:the )?\d+(?:st|nd|rd|th) day\b`,
      ],
    },
    stages: {
      "before-signing": "secondary",
      "problem-started": "primary",
      "compare-versions": "secondary",
    },
    reviewPrompt:
      "{clause} sets a time limit ({window|check the exact period}). Write down the date it works out to for you, and who has to act by then.",
  },
  {
    id: "time.renewal",
    family: "time",
    category: "renewal",
    title: "Renewal and extension",
    whyItMatters: "Renewal terms decide whether you drift into another term, and at what price.",
    detection: {
      any: [String.raw`\brenew(?:al|ed|s)?\b`, String.raw`\bexten(?:d|ded|sion)\b`, String.raw`\bautomatically\b`],
      all: [String.raw`\b(?:agreement|licen[cs]e|lease|term|contract|fee|rent)\b`],
      none: [String.raw`\bprobation\b`],
    },
    stages: {
      "before-signing": "primary",
      "problem-started": "secondary",
      "compare-versions": "primary",
    },
    reviewPrompt:
      "{clause} covers renewal. Check whether it renews by itself, how much notice a renewal needs, and whether the amount goes up each time.",
  },
  {
    id: "time.probation",
    family: "time",
    category: "probation",
    title: "Probation and confirmation",
    whyItMatters: "During probation the notice period and the employer's options are usually different.",
    detection: {
      any: [String.raw`\bprobation(?:ary)?\b`, String.raw`\bconfirmation\b(?! of receipt)`],
    },
    stages: { "before-signing": "primary", "problem-started": "secondary" },
    documentTypes: ["offer_letter"],
    reviewPrompt:
      "{clause} describes probation. Check how long it lasts, whether it can be extended, and what notice applies while you are on it.",
  },
  {
    id: "time.survival",
    family: "time",
    category: "survival",
    title: "Duties that continue after the end",
    whyItMatters: "Some obligations outlive the agreement, sometimes for years or for ever.",
    detection: {
      any: [
        String.raw`\bsurviv(?:e|es|al)\b`,
        String.raw`\bindefinitely\b`,
        String.raw`in perpetuity`,
        String.raw`\bafter (?:your |the )?(?:employment|engagement)\b`,
        String.raw`\bafter (?:the )?(?:expiry|termination) of this agreement\b`,
      ],
    },
    stages: {
      "before-signing": "primary",
      "problem-started": "secondary",
      "compare-versions": "secondary",
    },
    reviewPrompt:
      "{clause} keeps some duties alive after the agreement ends. Note which ones and for how long, so you know what still binds you afterwards.",
  },
  {
    id: "time.dated",
    family: "time",
    category: "date",
    title: "A specific calendar date",
    whyItMatters: "When a problem has started, the dated clauses are the skeleton of your timeline.",
    detection: {
      any: [
        String.raw`\b\d{1,2}(?:st|nd|rd|th)?\s+(?:day of\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December),?\s+\d{4}\b`,
      ],
    },
    stages: { "problem-started": "primary" },
    reviewPrompt: "{clause} names an exact date. Put it on your timeline with what was supposed to happen on it.",
  },
];
