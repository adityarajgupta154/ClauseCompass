import { normalizeForMatch } from "./normalize";

/**
 * The Responsible Language table (PRD section 8: "the model never decides
 * validity, odds of winning, or eligibility"; FR-06: a review prompt "asks a
 * neutral question - never 'this is illegal'"). ClauseCompass's own sentences
 * stay in the review register - "check this", "confirm this", "ask about
 * this" - and out of five registers that would turn information into a
 * verdict. This module is that rule as data plus a checker, so the rule is
 * enforced where sentences are made rather than merely requested:
 *
 * - the rule registry refuses a review-prompt template that trips it;
 * - the output validator withholds a model statement that trips it, and the
 *   retry tells the model which words and what to say instead;
 * - the view builders run every sentence they assemble through it;
 * - the model's system policy is generated from the same rows.
 *
 * It is a lint, not a filter: a sentence that trips it is withheld and
 * reported, never quietly rewritten. The document's own words are never
 * checked - they are quoted as data, and a clause may well say "unlawful".
 *
 * Patterns are matched against normalizeForMatch(text) (lower case, quotes
 * and dashes folded, whitespace collapsed) and are written for that form.
 * They target the verdict constructions ("is illegal", "you will win",
 * "you are entitled", "do not sign", "is unfair"), not bare words, so that a
 * neutral restatement of a clause about "unlawful use" or "the arbitrator
 * decides" passes. A miss is cheap - the sentence is shown - and a false
 * alarm is visible - the sentence is withheld with its reason - so the table
 * leans towards the constructions people actually write.
 */

export const LANGUAGE_REGISTERS = [
  "validity-verdict",
  "outcome-prediction",
  "eligibility-conclusion",
  "directive-advice",
  "fairness-judgement",
] as const;
export type LanguageRegister = (typeof LANGUAGE_REGISTERS)[number];

export interface LanguageRule {
  register: LanguageRegister;
  /** The register in a few words, for issue messages and the table. */
  label: string;
  /** What a sentence in this register does, as told to the model and to template authors. */
  never: string;
  /** The review-register alternative. */
  instead: string;
  /** Regular-expression sources over normalised text, compiled with the `u` flag. */
  patterns: readonly string[];
}

/**
 * Forms of "to be" and its hedges that introduce a verdict about a term.
 * The contracted form counts only after a pronoun ("it's standard"), so a
 * possessive ("the Company's standard agreement") is not read as one. A
 * copula after "held/found/deemed to" describes what a court might decide,
 * which a severability clause restated does, not a verdict of ours.
 */
const COPULA = String.raw`(?<!\b(?:held|found|deemed|declared|ruled|determined|adjudged|considered)\s+to\s+)(?:\b(?:is|are|was|were|be|been|being|becomes?|remains?|seems?|looks?|appears?|sounds?|feels?|would be|will be|may be|might be|could be|can be|cannot be|can't be|isn't|aren't|wasn't|weren't)\b|\b(?:it|that|this|which|what|there|here|one)'s)`;
/** Intensifiers and hedges that may sit between the copula and the verdict. */
const HEDGE = String.raw`(?:(?:not|clearly|obviously|definitely|probably|likely|certainly|completely|totally|entirely|legally|technically|perfectly|very|quite|rather|highly|extremely|pretty|too|so|really|fairly|somewhat|simply|just|plainly)\s+){0,2}`;
/** The person or side a prediction or verdict is about. */
const PARTY = String.raw`(?:you|they|he|she|the reader|the (?:landlord|owner|employer|company|firm|licensor|licensee|lessor|lessee|tenant|employee|bank|lender|borrower|other side|other party|counterparty))`;
/** Nouns for the document's own terms, as opposed to acts a clause may forbid. */
const TERM_NOUN = String.raw`(?:clauses?|terms?|conditions?|provisions?|deductions?|penalt(?:y|ies)|charges?|fees?|demands?|practices?|agreements?|contracts?|requirements?|restrictions?|policy|policies|deal|arrangement|offer|amount|figure|rate|period|notice period|deposit|rent|salary|interest|lock-in|bond|landlord|employer|company|licensor)`;

export const RESPONSIBLE_LANGUAGE: readonly LanguageRule[] = Object.freeze([
  {
    register: "validity-verdict",
    label: "a verdict on legality or validity",
    never: "say whether a term is legal, illegal, valid, void, binding, enforceable or against the law",
    instead:
      'name what the term says and ask the reader to check or confirm it, e.g. "check whether this deduction applies to you".',
    patterns: [
      // "this is illegal", "the clause is not enforceable", "it would be void", "it's legally binding"
      String.raw`${COPULA}\s+${HEDGE}(?:illegal|unlawful|lawful|legal|void|voidable|null and void|invalid|valid(?!\s+(?:for|until|till|up ?to|from|through|to)\b)|enforceable|unenforceable|binding(?!\s+(?:on|upon)\b)|non-binding|unconstitutional|a crime|an offence|an offense|against the law|within the law|permitted by law|prohibited by law|allowed by law|legally (?:valid|binding|enforceable|required|allowed|permitted|sound|safe|okay|ok|fine))\b`,
      // "an illegal clause", "unenforceable penalty"
      String.raw`\b(?:illegal|unlawful|void|invalid|unenforceable|unconstitutional)\s+${TERM_NOUN}\b`,
      // "probably not enforceable", "clearly void" - the verdict hedged, in any position
      String.raw`\b(?:probably|likely|clearly|certainly|definitely|obviously|surely|almost certainly|arguably|technically)\s+(?:not\s+)?(?:illegal|unlawful|lawful|legal|void|invalid|valid|enforceable|unenforceable|binding|unconstitutional)\b`,
      // "violates the law", "in breach of your rights", "goes against section 27"
      String.raw`\b(?:violates?|violating|violated|breach(?:es|ed|ing)?\s+of|breaks?|breaking|broke|contravenes?|infringes?|goes against|is against|are against|not allowed under|prohibited under|illegal under|not permitted under|banned under|forbidden under)\s+(?:(?:the|indian|applicable|your|state|central|local|contract|rent|tenancy|labou?r|shops?|establishments?|consumer|protection|information|technology|payment|wages|gratuity|industrial|disputes?|model|and|of|[a-z]+ state)\s+){0,6}(?:laws?|acts?|statutes?|constitution|labou?r laws?|rent control|consumer protection|legal rights|rights|(?:section|article|sec\.?|s\.)\s*\d+)\b`,
      // "cannot be enforced", "will not be upheld", "would be struck down"
      String.raw`\b(?:cannot|can't|can not|could not|couldn't|will not|won't|would not|wouldn't|may not|might not|must not|shall not|is unlikely to|are unlikely to|is likely to|are likely to|will|would|is going to|are going to|is sure to|is bound to)\s+be\s+(?:enforced|upheld|relied (?:up)?on|held against (?:you|the reader)|used against (?:you|the reader)|struck down|struck out|set aside|thrown out|voided|invalidated|overturned|quashed|declared (?:void|invalid|illegal|unenforceable))\b`,
      // "has no legal effect", "carries no legal weight", "is of no effect"
      String.raw`\b(?:has|have|had|having|with|of|carries|carry|carried|holds?)\s+no\s+legal\s+(?:right|basis|standing|authority|power|effect|force|validity|value|weight|consequence|meaning)\b`,
      String.raw`${COPULA}\s+${HEDGE}(?:of\s+)?no\s+(?:legal\s+)?(?:effect|force|validity)\b`,
      // "won't hold up in court", "would not stand up before a tribunal"
      String.raw`\b(?:not|won't|wouldn't|cannot|can't|doesn't|does not|never|unlikely to|likely to|will|would)\s+(?:hold up|stand up|stand|hold)\s+(?:in|before)\s+(?:a\s+|any\s+|the\s+)?(?:court|tribunal|law|arbitration)\b`,
      // ...but "to the extent legally permitted" or "unless legally required" restate a condition the document sets.
      String.raw`(?<!\b(?:extent|unless|where|wherever|if|as|when|whenever|otherwise)\s+)\blegally\s+(?:cannot|can't|obliged|obligated|bound|required|entitled|allowed|permitted|liable|responsible)\b`,
      String.raw`\b(?:cannot|can't|can not|may not)\s+(?:legally|lawfully)\b`,
      // Hinglish: "gair-kanooni" (illegal), "kanoonan galat" (legally wrong)
      String.raw`\bgair[- ]?kanooni\b`,
      String.raw`\bkanoonan\s+(?:galat|sahi)\b`,
    ],
  },
  {
    register: "outcome-prediction",
    label: "a prediction of the outcome",
    never: "predict what a court, an authority, the other side or the reader will get, win or lose, or rate the reader's chances",
    instead:
      'state what the document says would follow and ask the reader to confirm it with a professional, e.g. "the agreement names arbitration in Pune; ask what that would mean for you".',
    patterns: [
      // "you will win", "they would lose the case", "you can't win"
      String.raw`\b${PARTY}\s+(?:(?:will|would|shall|'ll|can|could|might|may|should|won't|wouldn't|can't|cannot|are (?:likely|sure|certain|bound|going) to|is (?:likely|sure|certain|bound|going) to)\s+)?(?:(?:easily|certainly|definitely|probably|likely|surely|never|not|almost certainly)\s+)?(?:win|prevail|succeed|lose\s+(?:the\s+)?(?:case|dispute|claim|argument|matter|suit|in court|at court))\b`,
      // "the court will rule in your favour", "a judge would order them to"
      String.raw`\b(?:courts?|judges?|tribunals?|authority|authorities|arbitrators?|the police|labou?r commissioner|rera|consumer forum|magistrate|the law)\s+(?:will|would|is likely to|are likely to|is sure to|is bound to|must|should|is going to|are going to|cannot|can't|won't|would never|will never)\s+(?:(?:rule|decide|find|side)\s+(?:in\s+)?(?:your|the reader's|their|${PARTY}'s)\s+favou?r|(?:award|grant|order|force|make|compel|protect|help|back|support)\s+(?:you|them|the reader|the (?:landlord|employer|company|licensor|tenant|employee))\b|(?:dismiss|reject|throw out|uphold|enforce|accept|allow|quash|overturn|set aside|void|invalidate|nullify|cancel|strike out|read down)\s+(?:it|this|that|the|your|their|such|any)\b|(?:strike|knock|throw)\s+(?:(?:it|this|that|the|such|any)\s+)?(?:\w+\s+){0,2}(?:down|out)\b|(?:find|hold|declare|deem|rule|consider|treat|see|regard)\s+(?:it|this|that|the|such|any)\s+(?:\w+\s+){0,3}(?:as\s+|to be\s+)?(?:void|invalid|illegal|unlawful|unenforceable|unfair|unreasonable|excessive|binding|valid|enforceable|reasonable|fair)\b)`,
      // "you have a strong case", "a weak claim", "good chances"
      String.raw`\b(?:strong|weak|good|solid|winning|losing|open-and-shut|clear-cut|watertight|airtight|hopeless|excellent|poor|slim|decent|fair|real)\s+(?:legal\s+)?(?:case|claim|grounds|position|chances?)\b`,
      // "chances of winning", "the odds of getting it back", "in your favour"
      String.raw`\b(?:chances?|odds|likelihood|probability|prospects?)\s+of\s+(?:winning|losing|success|succeeding|prevailing|recovering|getting (?:it|the|your|this|them|anything)|being (?:evicted|fired|dismissed|terminated|sued|paid|refunded|compensated))\b`,
      String.raw`\b(?:in|to)\s+(?:your|the reader's)\s+favou?r\b`,
      // "you will definitely get the deposit back", "they are bound to pay"
      String.raw`\b${PARTY}\s+(?:will|would|'ll|are|is)\s+(?:definitely|certainly|surely|undoubtedly|guaranteed to|bound to|sure to|certain to)\s+(?:get|receive|recover|keep|be|have|win|lose|pay|owe|face|return|refund)\b`,
      String.raw`\bguaranteed\s+(?:to\s+)?(?:win|succeed|get (?:it|your|the)|recover|be (?:paid|refunded))\b`,
      // Criminal consequences the document does not spell out
      String.raw`\b${PARTY}\s+(?:will|would|could|can|may|might)\s+(?:be\s+)?(?:go to (?:jail|prison)|be (?:jailed|imprisoned|arrested|prosecuted|charged)|face (?:jail|prison|arrest|criminal charges|prosecution))\b`,
      // Hinglish: "aap jeet jaoge" (you will win), "case haar jaoge" (you will lose the case)
      String.raw`\b(?:aap|tum|aapka|tumhara|aapki|tumhari)\s+(?:case\s+|yeh\s+|ye\s+)?(?:jeet|haar)\s*(?:jaoge|jayenge|jaenge|jaogi|jayengi|jaengi|sakte|sakti|loge|lenge)\b`,
      String.raw`\bcase\s+(?:jeet|haar)\s*(?:jaoge|jayenge|jaenge|jaogi|jayengi|jaengi|sakte|sakti|loge|lenge|jaega|jayega|jaenge)\b`,
    ],
  },
  {
    register: "eligibility-conclusion",
    label: "a conclusion about the reader's rights or eligibility",
    never: "say whether the reader is entitled, eligible, owed something, in the right, or has a case or a legal right",
    instead:
      'say what the document gives or does not mention and leave the conclusion to the reader and their adviser, e.g. "the letter mentions gratuity after five years; confirm how it is counted".',
    patterns: [
      // "you are entitled to", "you're not eligible", "you qualify"
      String.raw`\b(?:you|you're|the reader)\s+(?:(?:are|is|are not|aren't|is not|isn't|were|would be|will be|may be|might be|could be|are probably|are likely|are clearly|are definitely)\s+)?(?:not\s+)?(?:entitled|eligible|ineligible|qualified|disqualified)\b`,
      String.raw`\b(?:you|the reader)\s+(?:do not |don't |do |does not |doesn't |does )?qualif(?:y|ies)\b`,
      // "you have a legal right", "you have grounds to", "you have a case against them"
      String.raw`\b(?:you|the reader)\s+(?:have|has|'ve|had|hold|do not have|don't have|have no|has no|have every|have a|has a|have the|has the|have strong|have good|have every)\s+(?:(?:a|the|every|no|strong|good|clear|valid|legal|legitimate|solid)\s+)*(?:legal rights?|right to (?:sue|claim|refuse|withhold|demand|challenge|recover|be paid|be compensated|compensation|damages)|claim against|case against|case here|grounds (?:to|for)|recourse|remedy against|legal (?:remedy|claim|case|standing|grounds|protection))\b`,
      // "your rights are being violated", "a breach of your rights"
      String.raw`\b(?:your|the reader's)\s+(?:legal\s+)?rights\s+(?:are|were|have been|had been|are being|is being|will be|would be)\s+(?:being\s+)?(?:violated|breached|infringed|denied|ignored|trampled|taken away|affected|at risk)\b`,
      String.raw`\b(?:violat|breach|infring)\w*\s+(?:of\s+)?(?:your|the reader's)\s+(?:legal\s+)?rights\b`,
      // "you are in the right", "you are owed compensation", "you are off the hook"
      String.raw`\b(?:you|the reader)\s+(?:are|is|'re|were|will be|would be|are not|aren't|is not|isn't)\s+(?:not\s+)?(?:legally\s+)?(?:at fault|in the wrong|in the right|in the clear|off the hook|protected by (?:the\s+)?law|covered by (?:the\s+)?law|owed\s+(?:money|compensation|damages|a refund|back pay))\b`,
      // "you are owed the deposit back", "you are due a refund", "the company owes you notice pay", "you deserve"
      // ...but "check what you would be owed" puts the amount to the reader rather than deciding it.
      String.raw`(?<!\b(?:what|whether|how much|anything|something|amounts?|sums?|if)\s+)\b(?:you|the reader)\s+(?:are|is|'re|were|will be|would be|are not|aren't|is not|isn't|are still|is still|are also|is also)\s+(?:not\s+)?(?:still\s+)?(?:owed|due\s+(?:a|an|the|rs|inr|\d|money|compensation|back pay|notice pay|a refund|your|some|full|interest))\b`,
      String.raw`\b${PARTY}\s+(?:still\s+|clearly\s+|definitely\s+|legally\s+)?(?:owes?|owed)\s+(?:you|the reader)\s+(?:the|a|an|rs|inr|\d|money|back|compensation|damages|interest|salary|wages|notice pay|nothing|every|your|this|that|at least)\b`,
      String.raw`\b(?:you|the reader)\s+(?:do not\s+|don't\s+|does not\s+|doesn't\s+|clearly\s+|certainly\s+)?deserves?\b`,
      // Hinglish: "aapka haq hai" / "aap haqdar hain" (you are entitled)
      String.raw`\b(?:aapka|tumhara|aapki|tumhari)\s+(?:kanooni\s+)?haq\s+(?:hai|nahi hai|nahin hai)\b`,
      String.raw`\b(?:aap|tum)\s+(?:iske\s+|iska\s+)?haqdar\s+(?:ho|hain|hai|nahi|nahin)\b`,
    ],
  },
  {
    register: "directive-advice",
    label: "advice on what to decide",
    never: "tell the reader what to decide - to sign, refuse, accept, resign, sue, negotiate or withhold - or speak as an adviser",
    instead:
      'put the decision back with the reader as something to check or ask, e.g. "before you sign, ask whether the lock-in can be shortened".',
    patterns: [
      // "do not sign", "don't sign until", "just sign it", "never agree"
      String.raw`\b(?:do not|don't|never|do|please|just|simply|go ahead and|feel free to|you can safely)\s+(?:sign|agree|accept|refuse|reject|resign|quit|sue|hand over|give in|walk away|back down|pay up)\b`,
      // Bare imperatives: "Sign it.", "Refuse this.", "Walk away.", "Negotiate a shorter lock-in."
      String.raw`(?:^|[.!?]\s+)(?:sign|refuse|reject|accept|resign|quit|sue)\s+(?:it|this|that|the|now|immediately|today|them)\b`,
      String.raw`(?:^|[.!?]\s+)(?:walk away|back out|pull out|say no|push back|negotiate|renegotiate|withhold|stop paying|demand|insist on|go to court|file (?:a|an|the)\s+(?:case|suit|complaint|fir|claim|police complaint)|take legal action|take (?:them|him|her|it) to court|hold off|don't bother|do not bother)\b`,
      // "avoid signing", "refrain from paying", "steer clear of this deal", "hold off on signing"
      String.raw`\b(?:avoid|refrain from|steer clear of|hold off(?: on)?|stay away from|think twice before|be careful before|be wary of|beware of|no need to|there is no need to|it is (?:un)?safe to|it's (?:un)?safe to|it is (?:un)?wise to|it's (?:un)?wise to)\s+(?:signing|agreeing|accepting|paying|resigning|quitting|suing|handing over|giving in|walking away|backing down|sign|agree|accept|pay|resign|quit|sue)\b`,
      String.raw`\b(?:avoid|steer clear of|stay away from|walk away from|back out of|get out of|reject)\s+(?:this|that|the|such|any)\s+${TERM_NOUN}\b`,
      // "you should not sign", "you must refuse", "you'd better negotiate"
      String.raw`\b(?:you|the reader)\s+(?:should|shouldn't|should not|must|mustn't|must not|need to|needn't|need not|have to|has to|ought to|had better|'d better|would be wise to|would be better off|are advised to|are better off|are safer|really should|definitely should|should just|should simply)\s+(?:not\s+)?(?:sign|agree|accept|refuse|reject|sue|resign|quit|walk away|back down|go to court|file (?:a\s+)?(?:case|suit|complaint|fir|police complaint|claim)|take (?:legal\s+)?action|take (?:them|him|her|it) to court|stop paying|withhold|negotiate|renegotiate|push back|insist|demand)\b`,
      // Speaking as an adviser: "we recommend", "in my opinion", "I would not sign"
      String.raw`\bwe\s+(?:recommend|advise|suggest|urge|strongly (?:recommend|advise|suggest|urge)|think you should|would (?:recommend|advise|suggest))\b`,
      String.raw`\b(?:our|my)\s+(?:legal\s+|professional\s+|honest\s+|personal\s+)?(?:advice|recommendation|verdict)\b`,
      String.raw`\bin (?:my|our)\s+(?:legal\s+|professional\s+|honest\s+|personal\s+)?(?:opinion|view|assessment|judgement|judgment)\b`,
      String.raw`\b(?:i|we)\s+(?:would|'d)\s+(?:not\s+)?(?:sign|agree|accept|refuse|recommend|advise)\b`,
      // "the best thing to do is to", "the only option is to"
      String.raw`\bthe (?:best|right|smart|safe|safest|only|wise|wisest) (?:thing|move|option|course|choice|step)(?: to do)? (?:is|would be) to\b`,
      String.raw`\byou'?d be (?:foolish|crazy|mad|wise|smart|silly|stupid) to\b`,
      // Hinglish: "sign mat karo" / "sign na kijiye" (don't sign), "sign kar do" (sign it)
      String.raw`\b(?:sign|dastakhat|dastkhat)\s+(?:mat|na|nahi|nahin)\s+(?:karo|kariye|kijiye|karna|karein|karen)\b`,
      String.raw`\bmat\s+(?:sign|dastakhat)\s+(?:karo|kariye|kijiye|karna)\b`,
      String.raw`\b(?:sign|dastakhat)\s+kar\s+(?:do|dijiye|dena)\b`,
    ],
  },
  {
    register: "fairness-judgement",
    label: "a judgement of fairness or character",
    never:
      "call a term fair, unfair, standard, normal, reasonable, excessive, one-sided, risky or a red flag, or speculate about the other side's motives",
    instead:
      'describe the term in the document\'s own figures and let the reader compare, e.g. "the lock-in is 11 months and the notice period 3; check how that fits your plans".',
    patterns: [
      // "this is unfair", "the deposit seems excessive", "it's standard", "it is in your favour"
      String.raw`${COPULA}\s+${HEDGE}(?:unfair|fair|one-sided|lopsided|predatory|exploitative|abusive|unreasonable|reasonable|unconscionable|excessive|exorbitant|outrageous|unjust|unethical|immoral|wrong|fine|ok|okay|acceptable|unacceptable|normal|standard|typical|usual|customary|common practice|market standard|industry standard|generous|harsh|draconian|strict|lenient|suspicious|shady|dodgy|fishy|a red flag|a scam|a trap|a rip-off|a fraud|dangerous|risky|safe|harmless|worrying|alarming|concerning|troubling|problematic|a problem|a concern|bad|good|great|terrible|(?:in|to) (?:your|their) (?:favou?r|advantage|disadvantage)|against you|against your interests?|nothing to worry about|no big deal)\b`,
      // "probably unfair", "quite standard", "very one-sided" - the judgement hedged, in any position
      String.raw`\b(?:probably|likely|clearly|certainly|definitely|obviously|rather|quite|very|extremely|highly|pretty|too|somewhat|fairly|really)\s+(?:unfair|one-sided|lopsided|predatory|exploitative|abusive|unreasonable|reasonable|unconscionable|excessive|exorbitant|outrageous|unjust|draconian|harsh|onerous|punitive|risky|dangerous|suspicious|shady|dodgy|fishy|standard|normal|typical|common|usual|customary|fair|generous|strict|lenient|worrying|alarming|problematic)\b`,
      // "an excessive penalty", "unusually long lock-in", "very high deposit", "harsh terms"
      String.raw`\b(?:unfair|one-sided|lopsided|predatory|exploitative|abusive|unreasonable|unconscionable|excessive|exorbitant|outrageous|unjust|draconian|harsh|onerous|punitive|suspicious|shady|dodgy|fishy|dangerous|risky|worrying|alarming|problematic|unusual|abnormal|non-standard|nonstandard|unusually (?:high|low|long|short|strict|broad|wide|large|small)|surprisingly (?:high|low|long|short)|(?:very|extremely|too|quite|rather|pretty) (?:high|low|long|short|broad|wide|strict|large|small|big|steep))\s+${TERM_NOUN}\b`,
      // Idioms: "red flag", "a scam", "the catch is", "nothing to worry about", "trying to cheat you"
      String.raw`\b(?:red flags?|warning signs?|deal[- ]?breakers?|a scam|scams?\b|a fraud|fraudulent scheme|con job|rip-?off|a trap\b|a catch\b|the catch is|hidden trap|fine print trick|sneaky|shady|nothing to worry about|no cause for concern|no big deal|perfectly (?:normal|standard|fine|safe|ok|okay))`,
      String.raw`\b(?:cheat|trap|trick|exploit|con|fool|scam|squeeze|pressure|intimidate)(?:ing|s|ed)?\s+(?:you|the reader)\b`,
      String.raw`\b(?:take|taking|takes|took)\s+advantage\s+of\s+(?:you|the reader)\b`,
      // Motives: "they are trying to trap you", "the landlord is just out to avoid"
      String.raw`\b${PARTY}\s+(?:are|is|were|was)\s+(?:(?:clearly|obviously|probably|likely|just|only)\s+)?(?:trying|attempting|hoping|planning|out)\s+to\s+(?:cheat|trick|trap|scam|fool|exploit|con|squeeze|pressure|intimidate|rip|take advantage|get away|avoid|escape|dodge|hide|bury|sneak|wriggle)\b`,
      // Hinglish: "yeh galat hai" (this is wrong), "dhokha hai" (it is a fraud), "na-insaafi hai" (it is unjust)
      String.raw`\b(?:yeh|ye|yah|clause|shart)\s+(?:bilkul\s+|bahut\s+|ekdum\s+)?(?:galat|sahi|theek|thik|na-?insaafi|naainsafi|dhokha|dhoka|fraud|zyada|jyada)\s+hai\b`,
    ],
  },
]);

export interface LanguageViolation {
  register: LanguageRegister;
  /** The register in a few words, e.g. "a verdict on legality or validity". */
  label: string;
  /** The offending words as matched, in normalised form - short and from the lexicon's shape, never a passage. */
  phrase: string;
  /** The review-register alternative. */
  instead: string;
}

interface CompiledRule {
  rule: LanguageRule;
  patterns: RegExp[];
}

let compiled: CompiledRule[] | null = null;

function compile(): CompiledRule[] {
  compiled ??= RESPONSIBLE_LANGUAGE.map((rule) => ({
    rule,
    patterns: rule.patterns.map((source) => new RegExp(source, "u")),
  }));
  return compiled;
}

/** Longest a reported phrase may be: the constructions are short, and a longer match must not become a way to echo text. */
const MAX_PHRASE_CHARS = 60;

/**
 * Every register `text` falls into, in table order, one entry per rule that
 * matched (the first match of the first pattern that fired). Empty when the
 * text stays in the review register. Pure and cheap: a few dozen regular
 * expressions over one normalised string.
 */
export function findLanguageViolations(text: string): LanguageViolation[] {
  const normalized = normalizeForMatch(text);
  if (normalized === "") return [];
  const violations: LanguageViolation[] = [];
  for (const { rule, patterns } of compile()) {
    for (const pattern of patterns) {
      const match = pattern.exec(normalized);
      if (!match) continue;
      const phrase = match[0].trim().slice(0, MAX_PHRASE_CHARS);
      violations.push({ register: rule.register, label: rule.label, phrase, instead: rule.instead });
      break;
    }
  }
  return violations;
}

/** True when `text` is free of every register in the table. */
export function isResponsibleLanguage(text: string): boolean {
  return findLanguageViolations(text).length === 0;
}

/** One sentence per violation, for a validator detail, a schema issue or a log line. */
export function describeLanguageViolation(violation: LanguageViolation): string {
  return `${JSON.stringify(violation.phrase)} is ${violation.label}; instead, ${violation.instead}`;
}

/**
 * The table as an instruction for the model, generated from the same rows
 * the checker runs, so the policy the model reads and the check its output
 * meets cannot drift apart.
 */
export function responsibleLanguageInstruction(): string {
  const rows = RESPONSIBLE_LANGUAGE.map((rule, index) => `(${String.fromCharCode(97 + index)}) ${rule.never}`);
  return `Never ${rows.join("; ")}. Describe what the document says, in its own figures, and put anything beyond that as something for the reader to check or confirm.`;
}

/**
 * The review register itself: a review prompt puts a check, a question or
 * something to ask to the reader. A grounded, non-conclusory statement that
 * does neither ("The deposit is three months' fee.") is a fact, not a
 * prompt, so the review view treats it as off-register and shows the
 * registry's template instead. The test is structural - a question, an
 * imperative clause, a suggestion addressed to the reader, or a gap the
 * document leaves - not a keyword search: "The agreement asks you to repay"
 * and "the employer may request proof" only mention asking.
 */
const REVIEW_VERB = String.raw`(?:ask|check|double-?check|cross-?check|confirm|clarify|verify|compare|find out|make sure|be sure|be clear|look|re-?read|read|note|count|add up|calculate|work out|get|request|raise|consider|weigh|take|show|discuss|see|decide|question|keep|watch|write|know|walk through|go through|talk to|bear in mind|be aware|remember|list|put|follow|make|prepare|collect|gather|save|photograph|record|send|set out|expect|allow for|plan for|budget for)`;
const LEAD_IN = String.raw`(?:(?:so|then|also|and|but|or|first|next|now|please|do|if so|if not|if in doubt|either way|in that case|in any case|to be safe|before (?:you |signing |agreeing |paying |leaving |replying )?(?:sign|signing|agree|agreeing|pay|paying|leave|leaving|reply|replying|anything)?|on the last day|at handover|when you (?:sign|leave|reply|join))[,\s]+)*`;
const REVIEW_REGISTER: readonly RegExp[] = [
  // A question.
  /\?/u,
  // An imperative clause: at the start of a sentence, or after punctuation ("…; confirm whether it is pro-rated").
  new RegExp(String.raw`(?:^|[.!?;:,]\s*|\s[-]\s)${LEAD_IN}${REVIEW_VERB}\b(?!\s+(?:you|the reader)\s+to\b)`, "u"),
  // A suggestion addressed to the reader: "you may want to ask", "worth checking", "it helps to compare".
  new RegExp(String.raw`\b(?:you|the reader)\s+(?:may|might|could|can|will|would|need to|will need to|have to|ought to)\s+(?:also\s+)?(?:want to\s+|wish to\s+|need to\s+|like to\s+)?${REVIEW_VERB}\b`, "u"),
  /\bworth\s+(?:asking|checking|double-?checking|confirming|clarifying|verifying|comparing|reading|re-?reading|noting|knowing|finding out|raising|discussing|a look|a check|a question|a second look)\b/u,
  /\b(?:it helps to|it is useful to|it's useful to|it is safer to|it's safer to|the question is|the thing to check is|one thing to (?:check|ask|confirm|note|watch) is)\b/u,
  // A gap the document leaves, which is itself a thing to raise.
  /\b(?:the (?:letter|agreement|document|contract|clause|policy|offer|nda|deed|schedule|annexure|section|paragraph|term|terms|wording|form|notice)|it|this)\s+(?:does not|doesn't|never|nowhere)\s+(?:mention|say|state|specify|name|give|set out|cover|address|explain|define|fix|list|spell out)\b/u,
  /\b(?:is silent on|says nothing about|leaves (?:it )?open|not clear (?:whether|what|when|who|how|which)|unclear (?:whether|what|when|who|how|which)|no mention of|nothing (?:here|in it) about)\b/u,
];

/**
 * Null when `text` is in the review register (it asks, checks or names
 * something to confirm); otherwise one sentence for the retry prompt
 * saying how to rephrase.
 */
export function reviewRegisterIssue(text: string): string | null {
  const normalized = normalizeForMatch(text);
  if (normalized === "" || REVIEW_REGISTER.some((pattern) => pattern.test(normalized))) return null;
  return "The wording states a fact but puts nothing to the reader; phrase it as a question or as something to check, confirm or ask about, naming the wording it rests on.";
}
