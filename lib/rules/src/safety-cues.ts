import { z } from "zod";
import { type CompiledDetection, compileDetection, matchDetection } from "./engine";
import { deepFreeze } from "./freeze";
import { detectionSchema } from "./schema";

/**
 * Safety cues (PRD §8, "Danger/coercion/child-safety cue"). These are scanned
 * over what the *person* types — interview answers and questions — never over
 * document text, which is untrusted data. A match moves the flow to the
 * safety-escalation state: official emergency guidance first, no document
 * analysis.
 *
 * The lexicon is deliberately about force or harm to a person: threats of
 * violence, being hit, weapons, self-harm, a signature taken by force or
 * under threat, confinement, blackmail, a held passport, harm to a child.
 * Hardball tactics inside a dispute (a threatened lawsuit, changed locks, a
 * cut power line, "pressure" to sign by Friday) are not cues: those readers
 * need the document analysis, where the remedy and notice rules live, and
 * quoting a policy's own words ("misconduct includes violence") is not a
 * cue either, so harm words need the person in them (me, us, my, mujhe).
 * English, romanised Hindi and Devanagari are covered because the interview
 * is bilingual.
 */

export const SAFETY_CATEGORIES = ["danger", "self-harm", "coercion", "child-safety"] as const;
export type SafetyCategory = (typeof SAFETY_CATEGORIES)[number];

/**
 * Which official route the escalation screen should lead with. Keys only:
 * the numbers, names and "last checked" dates belong to the curated resource
 * registry (FR-10), never to code.
 */
export const GUIDANCE_KEYS = [
  "emergency-services",
  "police",
  "women-helpline",
  "child-helpline",
  "mental-health-helpline",
] as const;
export type GuidanceKey = (typeof GUIDANCE_KEYS)[number];

export const safetyCueSchema = z.object({
  id: z.string().regex(/^safety\.[a-z][a-z-]*$/),
  category: z.enum(SAFETY_CATEGORIES),
  /** Routes in the order the escalation screen should show them. */
  guidance: z.array(z.enum(GUIDANCE_KEYS)).min(1),
  detection: detectionSchema,
});
export type SafetyCue = z.infer<typeof safetyCueSchema>;

const PERSON = String.raw`(?:me|us|her|him|them|my (?:wife|husband|mother|father|sister|brother|child|kids?|son|daughter|family|parents))`;
const HARM = String.raw`(?:kill|murder|hurt|harm|beat|hit|burn|acid|knife|gun|weapon|rape|kidnap|jaan|maar|jala|life)`;

export const SAFETY_CUES: readonly SafetyCue[] = deepFreeze([
  {
    id: "safety.child",
    category: "child-safety",
    guidance: ["child-helpline", "emergency-services"],
    detection: {
      any: [
        String.raw`\b(?:child|children|kids?|son|daughter|baby|toddler|nabalig|bachch\w+|bacch\w+|beti|beta|(?:a|the|my|our|her|his) minor|minors|minor (?:child|children|girl|boy|son|daughter))\b[^.]{0,50}\b(?:abus\w*|molest\w*|beat\w*|beaten|hit|hurt|touch\w*|kidnap\w*|(?:is|has gone|went) missing|traffick\w*|unsafe|in danger|not safe|threat\w*|maar\w*|peet\w*|chhed\w*|gayab|utha (?:le|liya)|labou?r|majdoori|married off|marriage|shaadi|shadi)\b`,
        String.raw`\b(?:abus\w*|molest\w*|beat\w*|hit|hurt|touch\w*|kidnap\w*|traffick\w*|threat\w*)\b[^.]{0,50}\b(?:child|children|kids?|son|daughter|baby|toddler|nabalig|bachch\w+|bacch\w+|beti)\b`,
        String.raw`\b(?:child (?:abuse|marriage|labou?r|trafficking|pornography|sexual)|bal (?:vivah|majdoori|shram|shoshan)|underage (?:marriage|girl|boy|worker)|pocso|childline)\b`,
        String.raw`बच्च(?:ा|े|ी|ों)[^।.]{0,40}(?:मार|पीट|छेड़|गायब|उठा|शोषण|अगवा)`,
        String.raw`बाल (?:विवाह|मज़दूरी|मजदूरी|शोषण|श्रम)|नाबालिग`,
      ],
      none: [
        String.raw`\b(?:child|children|kids?|son|daughter)(?:'s|’s)? (?:education|school|tuition|custody|maintenance|visa|admission)\b`,
        String.raw`\bmissing (?:school|classes|payments?|documents?|pages?)\b`,
        String.raw`\bbeta (?:version|release|test\w*|build|phase|program\w*|access)\b`,
        String.raw`\bhit (?:the |a |our |their )?(?:deadline|target|milestone|market|limit|cap|ceiling|number)s?\b`,
      ],
    },
  },
  {
    id: "safety.self-harm",
    category: "self-harm",
    guidance: ["mental-health-helpline", "emergency-services"],
    detection: {
      any: [
        String.raw`\b(?:suicid\w*|kill myself|end my (?:own )?life|end it all|take my (?:own )?life|self[- ]harm\w*|hurt myself|cut myself|want to die|wish I (?:was|were) dead|no reason to live|better off dead|no point (?:in )?living)\b`,
        String.raw`\b(?:don'?t|dont|do not|no longer) (?:want|wish) to (?:live|be alive|go on living|stay alive)\b(?! (?:here|there|in|at|with|under|like|on|near|next|together|alone|anywhere|without))`,
        String.raw`\b(?:marna chaht[ai]|mar ja(?:a)?na chaht[ai]|mar ja(?:o|u)n(?:ga|gi)?|jeena nahi chaht[ai]|jeene ka man nahi|jaan de d(?:unga|ungi|oon|u)|apni jaan le|zindagi khatam kar|khud ko (?:maar|khatam|nuksan)\w*|khudkushi|aatmahatya)\b`,
        String.raw`आत्महत्या|ख़ुदकुशी|खुदकुशी|मरना चाहत|मर जाना चाहत|जीना नहीं चाहत|जान दे द`,
      ],
    },
  },
  {
    id: "safety.domestic",
    category: "danger",
    guidance: ["emergency-services", "women-helpline", "police"],
    detection: {
      any: [
        String.raw`\b(?:domestic violence|marital rape|dowry (?:harass\w*|death|torture|violence|demand\w* [^.]{0,30}\b(?:beat|hit|threat)\w*))\b`,
        String.raw`\b(?:husband|wife|in-?laws|sasural ?(?:wale|walo)?|pati|saas|sasur|father-in-law|mother-in-law|brother-in-law|devar|jeth)\b[^.]{0,40}\b(?:hits?|hitting|beat\w*|slap\w*|burn\w*|maar\w*|peet\w*|tortur\w*|threat\w*|dhamk\w*)`,
        String.raw`\b(?:gharelu hinsa|dahej (?:ke liye|ki) (?:maar|peet|dhamk)\w*)\b`,
        String.raw`घरेलू हिंसा|दहेज[^।.]{0,30}(?:मार|पीट|धमकी|प्रताड़)`,
      ],
    },
  },
  {
    id: "safety.violence",
    category: "danger",
    guidance: ["emergency-services", "police"],
    detection: {
      any: [
        String.raw`\b(?:threat\w*|dhamk\w*)\b[^.]{0,60}\b${HARM}\w*`,
        String.raw`\b(?:kill|murder|stab|shoot|strangle|burn|attack)(?:ed|ing|s)? ${PERSON}\b`,
        String.raw`\b(?:hurt|harm|beat|beaten|hits?|hitting|slap\w*|punch\w*|kick\w*|chok\w*|assault\w*|molest\w*|rap(?:ed|ing|es))\b ${PERSON}\b`,
        String.raw`\b(?:I|we|I'm|I am|we are|we're)\b (?:am |are |was |were |got |being |been )?(?:in danger|not safe|unsafe|assaulted|attacked|beaten|raped|molested|physically abused|scared for (?:my|our) (?:life|lives|safety))\b`,
        String.raw`\b(?:me|us|my|mujhe|mere|humein|hamein)\b[^.]{0,40}?\b(?:physical(?:ly)? (?:abus\w*|violen\w*|assault\w*|attack\w*)|acid attack|sexual(?:ly)? assault\w*)\b`,
        String.raw`\b(?:physical(?:ly)? (?:abus\w*|violen\w*|assault\w*|attack\w*)|acid attack|sexual(?:ly)? assault\w*)\b[^.]{0,40}?\b(?:me|us|my|mujhe|mere|humein|hamein)\b`,
        String.raw`\b(?:with|has|had|brought|showed|carrying|holding|pointed|waving) (?:a |an |the )?(?:knife|gun|pistol|revolver|weapon|blade|acid|iron rod|danda|chaku|chhuri|talwar)\b`,
        String.raw`\b(?:jaan se|jaan ka|jaan ko|jaan pe|jaan par) (?:maar\w*|khatra|khatre|bann?i)`,
        String.raw`\bmaar (?:daal|dal|de|dena|denge|dega|degi|dunga|dungi)\w*`,
        String.raw`\b(?:mujhe|humein|hamein|hume|use|usko|mere \w+ ko|meri \w+ ko) (?:maar\w*|peet\w*|jala\w*|jaan se)`,
        String.raw`\b(?:maar-?peet|maarpeet|pitai|pitayi|tezaab|tezab|balatkar|haath uthata|haath uthaya|haath uthati)\b`,
        String.raw`जान से मार|मार डाल|मारता है|मारती है|मारते हैं|मारा गया|मारा है|पीटता है|पीटती है|पीटते हैं|पीटा गया|पीटा है|पीटा जाता|मुझे (?:मार|पीट|जला|धमका)|मारपीट|हाथ उठा|तेज़ाब|तेजाब|बलात्कार|हमला किया|धमकी[^।.]{0,40}(?:मार|जान|जला)`,
      ],
    },
  },
  {
    id: "safety.coercion",
    category: "coercion",
    guidance: ["emergency-services", "police"],
    detection: {
      any: [
        String.raw`\b(?:forc(?:ed|ing)|compell\w*|coerc\w*) (?:me|us|her|him|them) (?:to |into )?sign\w*`,
        String.raw`\b(?:was|were|been|being|am|are|is) (?:forced|coerced|compelled) to sign\b`,
        String.raw`\bsign(?:ed|ing)? (?:it |this |that |the \w+ )?(?:under (?:threat|duress|force)|at (?:gun|knife)point|by force)\b`,
        String.raw`\b(?:under duress|at (?:gun|knife)point|blackmail\w*|extort(?:s|ed|ing|ion|ionist)?|sextortion|hafta vasool\w*|human traffick\w*|bonded labou?r)\b`,
        String.raw`\bthreat\w*[^.]{0,40}\b(?:leak|share|post|publish|send)\w* (?:my |our |her |his )?(?:photos?|pictures?|videos?|nudes|private (?:photos?|pictures?|videos?|chats?))\b`,
        String.raw`\block(?:ed|s|ing)? (?:me|us|her|him) (?:in|inside|up)\b`,
        String.raw`\b(?:held|kept|keeping|holding|keep) (?:me|us|her|him) (?:captive|hostage|against (?:my|our|her|his) will|locked)\b`,
        String.raw`\bconfin(?:ed|ing) (?:me|us|her|him)\b`,
        String.raw`\bnot (?:allowed|permitted|let) to leave the (?:house|room|flat|premises|hostel|building|office|home)\b`,
        String.raw`\b(?:won'?t|will not|don'?t|doesn'?t|do not|does not|not) (?:let|allow)(?:ing)? (?:me|us|her|him) (?:to )?(?:leave|go|go out|step out)(?: the| of the)? (?:house|room|flat|premises|hostel|building|office|home)\b`,
        String.raw`\b(?:took|taken|take|holding|kept|keeping|confiscat\w*|seiz\w*|snatch\w*|withh\w*|not returning|won'?t return|refus\w* to return) (?:away )?(?:my|our|his|her) (?:original )?passport\b`,
        String.raw`\b(?:zabardasti|jabardasti|jabran|zabran)\b[^.]{0,30}\b(?:sign|signature|dastakhat|dastkhat|angootha|angutha|thumb|karwa\w*|karva\w*|nikal(?:a|i| diya| di)|ghar se|band kar|utha (?:ke|kar|le))`,
        String.raw`\b(?:sign|signature|dastakhat|dastkhat|angootha|angutha)\b[^.]{0,30}\b(?:zabardasti|jabardasti|jabran|zabran)\b`,
        String.raw`\b(?:bandhak|bandhua)\b`,
        String.raw`\bdaba(?:v|av|o) (?:mein|me|dalkar|daal ?kar|dal ?kar|banakar|bana ?kar)\b[^.]{0,30}\b(?:sign|signature|dastakhat|dastkhat|angootha|angutha|thumb|karwa\w*|karva\w*)`,
        String.raw`\b(?:kamre mein band|ghar se bahar nahi (?:jaane|nikalne) (?:de|dete|deta|deti)|passport (?:le liya|rakh liya|chheen)\w*)`,
        String.raw`(?:ज़बरदस्ती|जबरदस्ती|जबरन)[^।.]{0,30}(?:साइन|सिग्नेचर|हस्ताक्षर|दस्तखत|अंगूठा|निकाल|बंद|उठा)|(?:साइन|सिग्नेचर|हस्ताक्षर|दस्तखत|अंगूठा)[^।.]{0,30}(?:ज़बरदस्ती|जबरदस्ती|जबरन)`,
        String.raw`दबाव (?:में|डालकर|बनाकर)[^।.]{0,30}(?:साइन|सिग्नेचर|हस्ताक्षर|दस्तखत|अंगूठा)|ब्लैकमेल|बंधक|कमरे में बंद|पासपोर्ट (?:ले लिया|रख लिया|छीन)`,
      ],
      none: [String.raw`\bunder pressure to (?:perform|meet|deliver|finish|complete)\b`],
    },
  },
]);

export interface SafetyCueMatch {
  cueId: string;
  category: SafetyCategory;
  guidance: readonly GuidanceKey[];
  /** The words that triggered the cue, for the log and for the screen's "you mentioned" line. */
  matched: string;
}

let compiledCues: Array<{ cue: SafetyCue; compiled: CompiledDetection }> | null = null;

function compiledSafetyCues(): Array<{ cue: SafetyCue; compiled: CompiledDetection }> {
  compiledCues ??= SAFETY_CUES.map((cue) => ({
    cue,
    compiled: compileDetection(safetyCueSchema.parse(cue).detection),
  }));
  return compiledCues;
}

/**
 * Every cue the text triggers, in lexicon order (the most specific routes
 * first: child, self-harm, domestic, then violence and coercion). Empty when
 * the text is safe to analyse normally.
 */
export function detectSafetyCues(text: string): SafetyCueMatch[] {
  const found: SafetyCueMatch[] = [];
  for (const { cue, compiled } of compiledSafetyCues()) {
    const match = matchDetection(compiled, text);
    if (match) found.push({ cueId: cue.id, category: cue.category, guidance: cue.guidance, matched: match.matched });
  }
  return found;
}
