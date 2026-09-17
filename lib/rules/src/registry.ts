import type { RuleFamily, RuleRegistry } from "./schema";
import { deepFreeze } from "./freeze";

/**
 * The clause-rule registry (PRD §7.1 / §8): what the product looks for in a
 * document, family by family, as data. Each rule says how a clause is
 * detected, which stage it matters most at, and what a reader should check
 * about it in plain words. The engine in engine.ts is the only interpreter;
 * no model ever sees these patterns.
 *
 * Conventions:
 * - Patterns are regular-expression sources compiled with the `iu` flags.
 *   Named groups (`period`, `amount`, `window`) are captured into the hit and
 *   can be used in the review prompt as `{name|fallback}`.
 * - `stages` lists where a rule leads (`primary`) or supports (`secondary`);
 *   a stage that is absent still gets the hit, as background.
 * - `documentTypes` narrows a rule to the document kinds it makes sense for.
 * - Review prompts speak to the reader, tell them what to check, and never
 *   say whether a clause is valid, fair or enforceable.
 *
 * The PRD's own clause-rule table was not carried into docs/PRD.md; this
 * registry is derived from its document-map fields (FR-04: parties, dates,
 * money, duties, termination, dispute wording), its change classes (FR-07:
 * money/time/duty/remedy) and the stage table in §8.
 */

/** Written-out and numeric quantities as they appear in agreements: "thirty (30)", "24", "one (1)". */
const NUMBER = String.raw`(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen|fifteen|eighteen|twenty(?:-four)?|thirty|forty-five|sixty|ninety)`;
const UNIT = String.raw`(?:hours?|days?|weeks?|months?|years?)`;
const PERIOD = String.raw`${NUMBER}\s*(?:\(\s*\d+\s*\)\s*)?${UNIT}`;
const AMOUNT = String.raw`(?:INR|Rs\.?|₹|Rupees)\s*[\d,]+(?:\.\d+)?(?:/-)?`;
/** Straight or typographic apostrophe; Word-produced documents use the curly one. */
const APOS = String.raw`['’]`;

export const RULE_FAMILIES: readonly RuleFamily[] = [
  {
    id: "money",
    label: "Money",
    description: "What you pay or receive: amounts, deposits, penalties, pay-backs and who covers extra costs.",
  },
  {
    id: "time",
    label: "Time",
    description:
      "How long things last and by when they must happen: term, deadlines, renewals, probation and what survives the end.",
  },
  {
    id: "duty",
    label: "Duty",
    description: "What you must do or must not do, and what the other side may decide on their own.",
  },
  {
    id: "exit",
    label: "Exit & remedies",
    description:
      "How either side can leave, what it costs to leave early, and what can be claimed if something goes wrong.",
  },
  {
    id: "data-ip",
    label: "Data & IP",
    description: "Secrets you must keep, who owns what you create, and what happens to your personal information.",
  },
];

/** Freezes the registry through every nested array and object. */
export const RULE_REGISTRY: RuleRegistry = deepFreeze({
  version: "2026-09-14",
  language: "en",
  families: [...RULE_FAMILIES],
  rules: [
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
  ],
});
