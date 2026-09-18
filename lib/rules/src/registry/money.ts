import type { RuleRegistry } from "../schema";

const AMOUNT = String.raw`(?:INR|Rs\.?|₹|Rupees)\s*[\d,]+(?:\.\d+)?(?:/-)?`;

export const MONEY_RULES: RuleRegistry["rules"] = [
  // ----------------------------------------------------------------- Money
  {
    id: "money.payment-terms",
    family: "money",
    category: "payment",
    title: "Main amount and when it is paid",
    whyItMatters: "The headline figure and its due date are the terms you will feel every month.",
    detection: {
      any: [String.raw`(?<amount>${AMOUNT})`],
      all: [
        String.raw`\b(?:licen[cs]e fee|rent|salary|cost to company|CTC|fee|charges?|payable|pay(?:ment)?|per month|monthly)\b`,
      ],
      none: [
        String.raw`\bdeposit\b`,
        String.raw`liquidated damages`,
        String.raw`\brepay\b`,
        String.raw`late[- ]payment`,
      ],
    },
    stages: {
      "before-signing": "primary",
      "problem-started": "secondary",
      "compare-versions": "primary",
    },
    reviewPrompt:
      "Check {clause}: is the amount the full figure you expected, when exactly is it due, and how must it be paid?",
  },
  {
    id: "money.deposit",
    family: "money",
    category: "deposit",
    title: "Deposit, its refund and deductions",
    whyItMatters:
      "Deposits are the money most often lost at the end; the deduction list decides how much comes back.",
    detection: {
      any: [
        String.raw`security deposit`,
        String.raw`\bdeposit\b.{0,40}\b(?:refund|deduct|forfeit|adjust)`,
        String.raw`\brefundable\b`,
      ],
    },
    stages: {
      "before-signing": "primary",
      "problem-started": "primary",
      "compare-versions": "secondary",
    },
    reviewPrompt:
      "Read {clause} for the deposit: how much is it, by when must it come back, and which deductions are allowed? Ask for each deduction to be spelled out before you pay.",
  },
  {
    id: "money.late-fees",
    family: "money",
    category: "penalty",
    title: "Late-payment charges",
    whyItMatters: "A small daily charge becomes a large sum over a month of delay.",
    detection: {
      any: [
        String.raw`late[- ]payment[- ](?:charge|fee|interest)`,
        String.raw`per day of delay`,
        String.raw`penal interest`,
        String.raw`interest (?:at|of) [\d.]+\s*%`,
        String.raw`\b(?:penalty|fine) of\b`,
      ],
      none: [String.raw`\bdeduct(?:ed|ing|ion|ions)?\b`],
    },
    stages: {
      "before-signing": "primary",
      "problem-started": "primary",
      "compare-versions": "secondary",
    },
    reviewPrompt:
      "{clause} adds a charge when a payment is late. Work out what one week and one month of delay would cost, and whether there is any grace period.",
  },
  {
    id: "money.bond-repayment",
    family: "money",
    category: "bond",
    title: "Money to pay back if you leave early",
    whyItMatters: "Training bonds and pay-backs turn a resignation into a bill.",
    detection: {
      any: [
        String.raw`training (?:bond|cost)`,
        String.raw`\b(?:training|induction)\b[^.]{0,80}\b(?:costs?|valued?|expenses?)\b`,
        String.raw`service (?:commitment|bond)`,
        String.raw`\brepay\b`,
        String.raw`reimburse (?:the|to the) company`,
        String.raw`recover(?:ed)? from (?:your|the) (?:final|full and final|salary)`,
      ],
    },
    stages: {
      "before-signing": "primary",
      "problem-started": "primary",
      "compare-versions": "secondary",
    },
    reviewPrompt:
      "{clause} asks you to pay money back if you leave early. Check the amount, whether it reduces month by month, and what counts as leaving early.",
  },
  {
    id: "money.discretionary",
    family: "money",
    category: "discretionary",
    title: "Pay that is at the other side's discretion",
    whyItMatters:
      "A figure marked discretionary may not be guaranteed; the conditions attached to it decide what you actually receive.",
    detection: {
      any: [
        String.raw`\bdiscretion(?:ary)?\b`,
        String.raw`does not guarantee`,
        String.raw`\bno(?:t a)? guarantee\b`,
        String.raw`\bat any time\b`,
      ],
      all: [String.raw`\b(?:bonus|variable|incentive|increment|increase|review(?:ed)?|restructure|components?)\b`],
    },
    stages: {
      "before-signing": "primary",
      "problem-started": "secondary",
      "compare-versions": "secondary",
    },
    reviewPrompt:
      "In {clause}, part of the pay or its review is at the other side's discretion. Ask what you would receive if targets are missed, and get any promised figure in writing.",
  },
  {
    id: "money.who-pays",
    family: "money",
    category: "charges",
    title: "Extra costs and who bears them",
    whyItMatters: "Maintenance, utilities, taxes and fees add up on top of the main amount.",
    detection: {
      any: [
        String.raw`maintenance charges`,
        String.raw`\bborne by\b`,
        String.raw`shared equally`,
        String.raw`stamp duty`,
        String.raw`registration charges`,
        String.raw`property tax`,
        String.raw`\butilit(?:y|ies)\b`,
        String.raw`\belectricity\b`,
      ],
    },
    stages: {
      "before-signing": "secondary",
      "problem-started": "secondary",
      "compare-versions": "secondary",
    },
    reviewPrompt:
      "{clause} says who pays which extra costs. List every charge on top of the main amount and confirm each one is yours or theirs.",
  },
];
