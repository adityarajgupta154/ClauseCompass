import type { RuleRegistry } from "../schema";

const NUMBER = String.raw`(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen|fifteen|eighteen|twenty(?:-four)?|thirty|forty-five|sixty|ninety)`;
const UNIT = String.raw`(?:hours?|days?|weeks?|months?|years?)`;
const PERIOD = String.raw`${NUMBER}\s*(?:\(\s*\d+\s*\)\s*)?${UNIT}`;
const APOS = String.raw`['’]`;

export const EXIT_RULES: RuleRegistry["rules"] = [
  // ------------------------------------------------------- Exit & remedies
  {
    id: "exit.notice",
    family: "exit",
    category: "notice",
    title: "Notice needed to end this",
    whyItMatters: "The notice period sets how quickly either side can walk away, and what it costs not to give it.",
    detection: {
      any: [
        String.raw`(?<period>${PERIOD})(?:${APOS}s?)?\s*(?:prior |advance )?(?:written )?notice\b`,
        String.raw`\bnotice (?:period )?of (?<period>${PERIOD})`,
        String.raw`\bin lieu of (?:such )?notice\b`,
        String.raw`\bnotice period\b`,
        String.raw`\bwithout notice\b`,
      ],
      all: [String.raw`\b(?:terminat\w*|resign\w*|end(?:ed|ing|s)?|leave|vacat\w*|expir\w*|withdraw\w*|in lieu)\b`],
    },
    stages: {
      "before-signing": "primary",
      "problem-started": "primary",
      "compare-versions": "primary",
    },
    reviewPrompt:
      "{clause} sets the notice needed to end this ({period|check the exact period}). Check it is the same for both sides, and whether money can be paid instead of notice.",
  },
  {
    id: "exit.notice-service",
    family: "exit",
    category: "notice-service",
    title: "How a notice must be given",
    whyItMatters: "A notice sent the wrong way can be treated as never given.",
    detection: {
      any: [
        String.raw`\bnotices? (?:under this agreement )?shall be (?:in writing|sent|delivered|given|served)\b`,
        String.raw`\bdeemed (?:to have been )?(?:served|received|delivered)\b`,
        String.raw`\bregistered post\b`,
      ],
    },
    stages: { "before-signing": "secondary", "problem-started": "primary" },
    reviewPrompt:
      "{clause} says how a notice must be given (address, method, when it counts as received). Follow it exactly and keep proof of sending.",
  },
  {
    id: "exit.termination",
    family: "exit",
    category: "termination",
    title: "How and when it can be ended",
    whyItMatters: "Termination grounds decide how fast you could be out, and on what basis.",
    detection: {
      any: [
        String.raw`\bimmediately\b`,
        String.raw`\bwithout notice\b`,
        String.raw`\bforthwith\b`,
        String.raw`\bfails? to pay\b`,
        String.raw`\bmisconduct\b`,
        String.raw`\bbreach\b`,
        String.raw`\bnuisance\b`,
        String.raw`\bmay terminate\b`,
        String.raw`\beither party may\b`,
        String.raw`\bterminated earlier\b`,
      ],
      all: [String.raw`\bterminat(?:e|ed|es|ion|ing)\b`],
    },
    stages: {
      "before-signing": "primary",
      "problem-started": "primary",
      "compare-versions": "primary",
    },
    reviewPrompt:
      "{clause} says how and when this can be ended. Check the grounds that let the other side end it quickly, and what you would be owed or have to pay if that happens.",
  },
  {
    id: "exit.lock-in",
    family: "exit",
    category: "lock-in",
    title: "Lock-in or minimum period",
    whyItMatters: "Leaving during a lock-in usually means paying for the time you did not stay.",
    detection: {
      any: [
        String.raw`\block-?in\b`,
        String.raw`minimum (?:period|term) of (?<period>${PERIOD})`,
        String.raw`unexpired portion`,
        String.raw`serve the company for a minimum`,
      ],
    },
    stages: {
      "before-signing": "primary",
      "problem-started": "primary",
      "compare-versions": "secondary",
    },
    reviewPrompt:
      "{clause} locks you in ({period|check the period}). Work out what leaving during it would cost, and whether the other side is locked in too.",
  },
  {
    id: "exit.handover",
    family: "exit",
    category: "handover",
    title: "What must be handed back at the end",
    whyItMatters: "Deposits and final pay are held against items and formalities on this list.",
    detection: {
      any: [
        String.raw`\bhand(?:ing)? (?:over|back)\b`,
        String.raw`\bvacat(?:e|es|ing|ed)\b`,
        String.raw`vacant and peaceful possession`,
        String.raw`return all (?:company )?property`,
        String.raw`return or (?:securely )?destroy`,
        String.raw`last working day`,
      ],
    },
    stages: { "before-signing": "secondary", "problem-started": "primary" },
    reviewPrompt:
      "{clause} covers what must be handed back when this ends. Make a checklist of items, deadlines and conditions so nothing is held against your deposit or final pay.",
  },
  {
    id: "exit.remedies",
    family: "exit",
    category: "remedy",
    title: "What can be claimed if things go wrong",
    whyItMatters: "Fixed damages, indemnities and double-rent clauses set the price of a breach in advance.",
    detection: {
      any: [
        String.raw`liquidated damages`,
        String.raw`\bindemnif(?:y|ies|ied|ication)\b`,
        String.raw`hold harmless`,
        String.raw`\bcompensation for\b`,
        String.raw`double the monthly`,
        String.raw`per instance of breach`,
        String.raw`injunctive relief`,
        String.raw`specific performance`,
        String.raw`\bactual damages\b`,
        String.raw`\bforfeit(?:ed|ure)?\b`,
      ],
    },
    stages: {
      "before-signing": "primary",
      "problem-started": "primary",
      "compare-versions": "primary",
    },
    reviewPrompt:
      "{clause} sets what the other side can claim if things go wrong. Check whether any amount is fixed in advance, whether it is capped, and whether it runs only one way.",
  },
  {
    id: "exit.liability",
    family: "exit",
    category: "liability",
    title: "Limits and exclusions of liability",
    whyItMatters: "A cap or exclusion decides how much you could ever recover, whatever went wrong.",
    detection: {
      any: [
        String.raw`\blimitation of liability\b`,
        String.raw`\b(?:shall|will) not be liable\b`,
        String.raw`\bno liability\b`,
        String.raw`\bliability [^.]{0,40}\b(?:limited to|capped at|shall not exceed|not exceed)\b`,
        String.raw`\b(?:indirect|consequential|incidental|special) (?:loss|losses|damages?)\b`,
        String.raw`\bloss of (?:profit|profits|business|data)\b`,
        String.raw`\bat (?:your|the licensee${APOS}s|the receiving party${APOS}s) (?:own|sole) risk\b`,
      ],
    },
    stages: { "before-signing": "primary", "problem-started": "primary", "compare-versions": "primary" },
    reviewPrompt:
      "{clause} limits what can be claimed from the other side. Check the cap, what kinds of loss are excluded, and whether the same limit protects you too.",
  },
  {
    id: "exit.disputes",
    family: "exit",
    category: "dispute",
    title: "Where and how disputes are decided",
    whyItMatters: "The forum, the city and who picks the arbitrator decide how practical it is to complain at all.",
    detection: {
      any: [
        String.raw`\barbitrat(?:ion|or)\b`,
        String.raw`exclusive jurisdiction`,
        String.raw`\bcourts? (?:at|of|in)\b`,
        String.raw`governed by (?:and construed in accordance with )?the laws of`,
        String.raw`\bcompetent authority\b`,
        String.raw`\bmediation\b`,
      ],
    },
    stages: {
      "before-signing": "secondary",
      "problem-started": "primary",
      "compare-versions": "secondary",
    },
    reviewPrompt:
      "{clause} decides where and how a dispute would be handled. Note the city, whether it is a court or an arbitrator, who picks the arbitrator, and who pays the costs.",
  },
];
