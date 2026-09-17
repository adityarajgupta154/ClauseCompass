import { describe, expect, it } from "vitest";
import { compilePattern } from "./engine";
import {
  GUIDANCE_KEYS,
  SAFETY_CATEGORIES,
  SAFETY_CUES,
  type SafetyCategory,
  detectSafetyCues,
  safetyCueSchema,
} from "./safety-cues";

const escalates: Array<[SafetyCategory, string]> = [
  ["danger", "He said he will kill me if I don't sign the new agreement"],
  ["danger", "My landlord is threatening to beat me up if I don't vacate by Sunday"],
  ["danger", "Wo mujhe jaan se maarne ki dhamki de raha hai"],
  ["danger", "Mera makaan malik mujhe maarta hai aur ghar se bahar nahi nikalne deta"],
  ["danger", "उसने जान से मारने की धमकी दी है"],
  ["danger", "he came to the flat with a knife yesterday"],
  ["danger", "I am not safe in this house, he threatens me daily"],
  ["danger", "Mujhe dhamki de rahe hain ki ghar jala denge"],
  ["danger", "he physically assaulted me last night"],
  ["danger", "My husband hits me and dowry demands keep coming, is the rent agreement valid"],
  ["danger", "Sasural wale mujhe peet-te hain"],
  ["danger", "Domestic violence case chal raha hai, agreement mein kya hai"],
  ["danger", "मुझे पीटा गया और घर से निकाल दिया"],
  ["coercion", "The employer took my passport and won't return it until the bond is over"],
  ["coercion", "Owner ne zabardasti sign karwaya"],
  ["coercion", "पति ज़बरदस्ती साइन करवा रहा है"],
  ["coercion", "They locked me in the office until I signed the resignation letter"],
  ["coercion", "I was forced to sign the bond at knifepoint"],
  ["coercion", "The contractor is blackmailing me with my photos"],
  ["coercion", "He is extorting money from us every month"],
  ["coercion", "zabardasti ghar se nikal diya raat ko, saman bhi bahar phenk diya"],
  ["coercion", "जबरन साइन करवाया गया"],
  ["coercion", "I signed at knifepoint"],
  ["child-safety", "Meri beti ko unka beta touch karta hai, kya karun"],
  ["child-safety", "my 14 year old son is made to work at the factory, child labour"],
  ["child-safety", "बच्चे को मारते हैं"],
  ["self-harm", "I don't want to live anymore, the debt is too much"],
  ["self-harm", "mai marna chahta hoon"],
  ["self-harm", "आत्महत्या करने का मन करता है"],
  ["self-harm", "I do not want to live"],
  ["self-harm", "honestly I just want to die"],
  ["self-harm", "mar jaunga main agar yeh case haar gaya"],
];

const staysInAnalysis = [
  "My landlord is threatening to file a police complaint if I don't vacate",
  "The company says they will sue me for the bond amount",
  "I can't leave the job because of the 18-month bond",
  "Deadline is tomorrow and I am scared of losing the deposit",
  "Does the NDA cover harassment claims against the company?",
  "The agreement has a clause about assault insurance for the premises",
  "Minor changes to the agreement were made after I signed",
  "The landlord changed the locks and cut the electricity, what are my remedies?",
  "My daughter is missing school because we may have to move",
  "Kya notice period 3 mahine ka hona zaroori hai",
  "What does the termination clause say about killing the contract early?",
  "I feel pressured to accept the offer by Friday",
  "Under pressure to deliver the project the manager asked me to sign a new SOW",
  "The child's education allowance is mentioned in clause 5",
  "They kept my original certificates and are demanding the bond amount",
  "He threatened legal action and said the matter will go to court",
  "Beta version of the app was delivered late, they did not hit the deadline",
  "The threat of termination is mentioned in clause 9",
  "maine hafte mein 3 din kaam kiya, salary poori nahi mili",
  "My wife and I signed the lease together, can she terminate alone?",
  "The son of the landlord wants the flat back, notice period kya hai",
  "The company can terminate for gross misconduct including physical violence at the workplace",
  "Interest at 18% on delayed payment feels extortionate, is that legal?",
  "My daughter is a minor, can she be a party to the agreement?",
  "I was made to sign a blank cheque as security, is that allowed?",
  "Clause 12 talks about force majeure and acts of God",
  "1. The Licensee shall pay the Licence Fee on or before the 5th day of each month.",
  "I signed the offer under pressure, can I still negotiate the notice period?",
  "Owner ne zabardasti rent badha diya, agreement mein 5% likha hai",
  "ज़बरदस्ती किराया बढ़ा दिया है",
  "I don't want to live in this flat anymore, how do I exit early?",
  "I don't want to live here after the lock-in",
  "I can't go on paying this rent",
  "I cannot live in this flat anymore",
  "dabav mein hoon, kya karun",
  "",
];

describe("safety cues", () => {
  it("is a valid lexicon: unique ids, known categories and guidance keys, compilable patterns", () => {
    const ids = new Set<string>();
    for (const cue of SAFETY_CUES) {
      expect(() => safetyCueSchema.parse(cue)).not.toThrow();
      expect(ids.has(cue.id)).toBe(false);
      ids.add(cue.id);
      expect(SAFETY_CATEGORIES).toContain(cue.category);
      for (const key of cue.guidance) expect(GUIDANCE_KEYS).toContain(key);
      for (const source of [...cue.detection.any, ...(cue.detection.all ?? []), ...(cue.detection.none ?? [])]) {
        expect(() => compilePattern(source)).not.toThrow();
      }
    }
    expect(Object.isFrozen(SAFETY_CUES)).toBe(true);
    for (const cue of SAFETY_CUES) {
      expect(Object.isFrozen(cue)).toBe(true);
      expect(Object.isFrozen(cue.guidance)).toBe(true);
      expect(Object.isFrozen(cue.detection.any)).toBe(true);
    }
  });

  it("hands out guidance a caller cannot change for the next reader", () => {
    const [cue] = detectSafetyCues("he will kill me");
    expect(cue).toBeDefined();
    expect(() => (cue!.guidance as string[]).push("police")).toThrow(TypeError);
    expect(detectSafetyCues("he will kill me")[0]?.guidance).toEqual(["emergency-services", "police"]);
  });

  it("covers every category with at least one cue", () => {
    for (const category of SAFETY_CATEGORIES)
      expect(
        SAFETY_CUES.some((cue) => cue.category === category),
        category,
      ).toBe(true);
  });

  it.each(escalates)("escalates (%s): %s", (category, text) => {
    const cues = detectSafetyCues(text);
    expect(cues.length).toBeGreaterThan(0);
    expect(cues[0]?.category).toBe(category);
    expect(cues[0]?.matched.length).toBeGreaterThan(0);
    expect(text.toLowerCase()).toContain(cues[0]!.matched.toLowerCase());
  });

  it.each(staysInAnalysis)("does not escalate: %s", (text) => {
    expect(detectSafetyCues(text)).toEqual([]);
  });

  it("routes family violence to the women's helpline first, ahead of the generic violence cue", () => {
    const cues = detectSafetyCues("My husband hits me");
    expect(cues.map((cue) => cue.cueId)).toEqual(["safety.domestic", "safety.violence"]);
    expect(cues[0]?.guidance).toEqual(["emergency-services", "women-helpline", "police"]);
  });

  it("is linear in the text length", () => {
    const filler = "The Licensee shall pay the Licence Fee on or before the 5th day of each month, without deduction. ";
    const long = filler.repeat(2000);
    const started = Date.now();
    expect(detectSafetyCues(long)).toEqual([]);
    expect(detectSafetyCues(`${long} mujhe jaan se maarne ki dhamki`).length).toBe(1);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
