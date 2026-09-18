import type { RuleRegistry } from "../schema";

export const DATA_IP_RULES: RuleRegistry["rules"] = [
  // ------------------------------------------------------------- Data & IP
  {
    id: "data-ip.confidentiality",
    family: "data-ip",
    category: "confidentiality",
    title: "Information you must keep secret",
    whyItMatters: "Confidentiality duties define what you can never repeat, show or reuse.",
    detection: {
      any: [
        String.raw`\bconfiden(?:tial|tiality|ce)\b`,
        String.raw`non-?disclosure`,
        String.raw`trade secrets?`,
        String.raw`\bproprietary information\b`,
      ],
      none: [String.raw`^this [^.]{0,80}\bagreement\b[^.]{0,40}\b(?:is made|is entered into|dated)\b`],
    },
    stages: {
      "before-signing": "primary",
      "problem-started": "secondary",
      "compare-versions": "secondary",
    },
    reviewPrompt:
      "{clause} makes you keep information secret. Check what counts as confidential, for how long, and what you are allowed to keep for your own portfolio or records.",
  },
  {
    id: "data-ip.ip",
    family: "data-ip",
    category: "ip",
    title: "Who owns what you create",
    whyItMatters: "Ownership clauses can reach work done on your own time or with your own tools.",
    detection: {
      any: [
        String.raw`intellectual property`,
        String.raw`\bwork product\b`,
        String.raw`\binventions?\b`,
        String.raw`\bassign(?:s|ed|ment)? (?:to the company|all rights)\b`,
        String.raw`\bsole property\b`,
        String.raw`\bno licen[cs]e\b`,
        String.raw`\bcopyrights?\b`,
        String.raw`moral rights`,
      ],
    },
    stages: {
      "before-signing": "primary",
      "problem-started": "secondary",
      "compare-versions": "secondary",
    },
    reviewPrompt:
      "{clause} decides who owns what you create. Check whether it covers work done in your own time or with your own tools, and whether earlier work of yours is excluded.",
  },
  {
    id: "data-ip.personal-data",
    family: "data-ip",
    category: "data",
    title: "Your personal information",
    whyItMatters: "Consent clauses decide what is collected about you, who sees it and for how long.",
    detection: {
      any: [
        String.raw`personal data`,
        String.raw`\bconsent to the (?:company )?(?:collecting|processing|use)\b`,
        String.raw`\bprocess(?:ing)? (?:of )?(?:your |the )?(?:personal )?(?:data|information)\b`,
        String.raw`data protection`,
        String.raw`\bDPDP\b`,
        String.raw`\bprivacy\b`,
        String.raw`\bbiometric\b`,
      ],
    },
    stages: {
      "before-signing": "primary",
      "problem-started": "secondary",
      "compare-versions": "primary",
    },
    reviewPrompt:
      "{clause} covers your personal information. Check what is collected, who it is shared with, how long it is kept, and whether you can withdraw consent.",
  },
  {
    id: "data-ip.monitoring",
    family: "data-ip",
    category: "monitoring",
    title: "Monitoring and inspection",
    whyItMatters: "Monitoring and entry rights reach into your devices, accounts or home.",
    detection: {
      any: [
        String.raw`\bmonitor(?:ed|ing)?\b`,
        String.raw`acceptable use`,
        String.raw`\bsurveillance\b`,
        String.raw`\bCCTV\b`,
        String.raw`\benter and inspect\b`,
        String.raw`\bright of (?:entry|inspection)\b`,
      ],
    },
    stages: {
      "before-signing": "primary",
      "problem-started": "secondary",
      "compare-versions": "secondary",
    },
    reviewPrompt:
      "{clause} allows monitoring or inspection. Check what can be looked at, how much notice you get, and what is off-limits.",
  },
  {
    id: "data-ip.incident",
    family: "data-ip",
    category: "incident",
    title: "Events you must report quickly",
    whyItMatters: "A missed reporting window can itself count as a breach.",
    detection: {
      any: [
        String.raw`unauthori[sz]ed (?:use|disclosure|access)`,
        String.raw`\bbreach\b`,
        String.raw`\bloss\b`,
        String.raw`\bincident\b`,
        String.raw`\bcourt order\b`,
        String.raw`required by law`,
      ],
      all: [String.raw`\b(?:notify|inform|report|give [^.]{0,40}\bnotice)\b`],
    },
    stages: { "before-signing": "secondary", "problem-started": "primary" },
    reviewPrompt:
      "{clause} makes you report certain events quickly. Note the time limit and to whom, because missing it can itself count as a breach.",
  },
  {
    id: "data-ip.handling",
    family: "data-ip",
    category: "handling",
    title: "How information must be stored and handled",
    whyItMatters: "Practical rules about devices, cloud storage and AI tools are easy to break by habit.",
    detection: {
      any: [
        String.raw`\bencrypted\b`,
        String.raw`cloud storage`,
        String.raw`code repository`,
        String.raw`artificial intelligence`,
        String.raw`\bAI (?:service|tool)s?\b`,
        String.raw`\bpersonal (?:device|email|account)s?\b`,
        String.raw`\bcopies\b`,
        String.raw`\bderived materials\b`,
      ],
    },
    stages: { "before-signing": "primary", "problem-started": "secondary" },
    reviewPrompt:
      "{clause} says how you must store and handle information. Check the practical rules (devices, cloud, AI tools) against how you actually work.",
  },
];
