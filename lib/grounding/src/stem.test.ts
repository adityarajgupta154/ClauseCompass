import { describe, expect, it } from "vitest";
import { stem } from "./stem";

// Word pairs from Porter's 1980 paper, one per rule, plus the contract words the retriever lives on.
const PORTER_EXAMPLES: Array<[word: string, stemmed: string]> = [
  ["caresses", "caress"],
  ["ponies", "poni"],
  ["ties", "ti"],
  ["caress", "caress"],
  ["cats", "cat"],
  ["feed", "feed"],
  ["agreed", "agre"],
  ["plastered", "plaster"],
  ["bled", "bled"],
  ["motoring", "motor"],
  ["sing", "sing"],
  ["conflated", "conflat"],
  ["troubled", "troubl"],
  ["sized", "size"],
  ["hopping", "hop"],
  ["tanned", "tan"],
  ["falling", "fall"],
  ["hissing", "hiss"],
  ["fizzed", "fizz"],
  ["failing", "fail"],
  ["filing", "file"],
  ["happy", "happi"],
  ["sky", "sky"],
  ["relational", "relat"],
  ["conditional", "condit"],
  ["rational", "ration"],
  ["valenci", "valenc"],
  ["digitizer", "digit"],
  ["vietnamization", "vietnam"],
  ["predication", "predic"],
  ["operator", "oper"],
  ["feudalism", "feudal"],
  ["decisiveness", "decis"],
  ["hopefulness", "hope"],
  ["callousness", "callous"],
  ["formaliti", "formal"],
  ["sensitiviti", "sensit"],
  ["sensibiliti", "sensibl"],
  ["triplicate", "triplic"],
  ["formative", "form"],
  ["formalize", "formal"],
  ["electriciti", "electr"],
  ["electrical", "electr"],
  ["hopeful", "hope"],
  ["goodness", "good"],
  ["revival", "reviv"],
  ["allowance", "allow"],
  ["inference", "infer"],
  ["airliner", "airlin"],
  ["gyroscopic", "gyroscop"],
  ["adjustable", "adjust"],
  ["defensible", "defens"],
  ["irritant", "irrit"],
  ["replacement", "replac"],
  ["adjustment", "adjust"],
  ["dependent", "depend"],
  ["adoption", "adopt"],
  ["communism", "commun"],
  ["activate", "activ"],
  ["angulariti", "angular"],
  ["homologous", "homolog"],
  ["effective", "effect"],
  ["bowdlerize", "bowdler"],
  ["probate", "probat"],
  ["rate", "rate"],
  ["cease", "ceas"],
  ["controll", "control"],
  ["roll", "roll"],
  ["generalizations", "gener"],
];

const CONTRACT_WORDS: Array<[words: string[], stemmed: string]> = [
  [["notice", "notices", "noticed"], "notic"],
  [["terminate", "terminated", "termination", "terminating"], "termin"],
  [["party", "parties"], "parti"],
  [["deposit", "deposits", "deposited"], "deposit"],
  [["refund", "refunded", "refundable"], "refund"],
  [["renew", "renewal", "renewed"], "renew"],
  [["confidential", "confidentiality"], "confidenti"],
  [["probation"], "probat"],
  [["pay", "pays", "paying"], "pai"],
  [["day", "days"], "dai"],
  [["month", "months"], "month"],
  [["monthly"], "monthli"],
];

describe("Porter stemmer", () => {
  it.each(PORTER_EXAMPLES)("%s → %s", (word, expected) => {
    expect(stem(word)).toBe(expected);
  });

  it.each(CONTRACT_WORDS)("%j share the stem %s", (words, expected) => {
    for (const word of words) expect(stem(word), word).toBe(expected);
  });

  it("handles runs of y without recursing", () => {
    const started = Date.now();
    expect(stem("y".repeat(20_000))).toHaveLength(20_000);
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(stem("syzygy")).toBe("syzygi");
    expect(stem("flying")).toBe("fly");
    expect(stem("happy")).toBe("happi");
  });

  it("leaves short words, numbers and non-Latin words alone", () => {
    for (const word of ["a", "an", "is", "12", "2026", "किराया", "महीने", "e-mail", "Notice", "co2"]) {
      expect(stem(word)).toBe(word);
    }
  });
});
