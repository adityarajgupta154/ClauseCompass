import { describe, expect, it } from "vitest";
import {
  LANGUAGE_REGISTERS,
  RESPONSIBLE_LANGUAGE,
  describeLanguageViolation,
  findLanguageViolations,
  isResponsibleLanguage,
  responsibleLanguageInstruction,
  reviewRegisterIssue,
  type LanguageRegister,
} from "./language";

/**
 * PRD section 8 and FR-06: ClauseCompass's own sentences never decide
 * validity, odds, eligibility, the reader's decision or fairness. The table
 * is checked both ways: the constructions people actually write in each
 * register are caught, and neutral restatements of a clause - including ones
 * that use the same words - are not, because a false alarm withholds a true
 * sentence from the reader.
 */

const registers = (text: string) => findLanguageViolations(text).map((v) => v.register);

const CAUGHT: Record<LanguageRegister, string[]> = {
  "validity-verdict": [
    "This clause is illegal.",
    "The penalty is not enforceable in India.",
    "Such a deduction would be void under the Act.",
    "It's legally binding on you once signed.",
    "An unenforceable penalty like this one is common.",
    "The clause violates the Indian Contract Act.",
    "That goes against section 27.",
    "They have no legal right to keep the deposit.",
    "The fee is high and probably not enforceable.",
    "The employer cannot legally hold your certificates.",
    "This clause cannot be enforced.",
    "This term has no legal effect.",
    "Such a penalty would not hold up in court.",
    "The bond will be struck down if challenged.",
    "Yeh clause gair-kanooni hai.",
  ],
  "outcome-prediction": [
    "You will win if this goes to court.",
    "They would lose the case on this point.",
    "A court will rule in your favour.",
    "The judge would order them to refund it.",
    "You have a strong case here.",
    "Your chances of getting it back are good.",
    "You will definitely get the deposit back.",
    "You could be arrested for breaking this clause.",
    "A court is likely to strike this clause down.",
    "A tribunal would find the deduction unreasonable.",
    "Aap yeh case jeet jaoge.",
  ],
  "eligibility-conclusion": [
    "You are entitled to gratuity.",
    "You're not eligible for the bonus.",
    "You have a legal right to a copy.",
    "You have grounds to challenge this.",
    "Your rights are being violated here.",
    "You are in the right on this one.",
    "You are owed the deposit back.",
    "The company owes you notice pay for the shortfall.",
    "You are due a refund of the balance.",
    "You deserve the full amount.",
    "Aapka haq hai.",
  ],
  "directive-advice": [
    "Do not sign this agreement.",
    "Don't agree to the lock-in.",
    "You should refuse the bond.",
    "You must negotiate the notice period.",
    "We recommend walking away.",
    "In my opinion this is a bad deal.",
    "I would not sign this.",
    "The best thing to do is to resign now.",
    "Avoid signing this agreement.",
    "Hold off on paying until the receipt arrives.",
    "Negotiate a shorter lock-in.",
    "Walk away from this deal.",
    "Sign mat karo.",
  ],
  "fairness-judgement": [
    "This is unfair.",
    "The deposit seems excessive.",
    "That is standard in Bengaluru.",
    "It's standard, and that's acceptable for a first job.",
    "It is in your favour.",
    "An unusually long lock-in period is included.",
    "This is a red flag.",
    "The landlord is trying to trap you.",
    "The clause is one-sided.",
    "Late fees like this are quite common in Pune.",
    "You have nothing to worry about here.",
    "Yeh galat hai.",
  ],
};

const PASSES = [
  // Review register: naming the wording, asking the reader to check.
  "Clause 4 keeps the deposit for 60 days after you leave; check when it is due back and what can be deducted.",
  "The letter names a 24-month bond of ₹2,00,000 if you leave early. Confirm whether it is pro-rated.",
  "Read clause 7.2 for the notice period: one month from either side. Ask whether it can be shortened.",
  "Before you sign, ask whether the lock-in can be shortened.",
  "Worth confirming: the agreement is valid for 11 months from 1 April 2026.",
  "The agreement says it is binding on both parties and their heirs.",
  // The document's own words, restated without a verdict on them.
  "The tenant must not use the premises for any unlawful purpose.",
  "The employee must not engage in criminal conduct or breach of confidentiality.",
  "Disputes will be decided by an arbitrator in Pune; the arbitrator's decision is final.",
  "The court at Pune has exclusive jurisdiction over disputes.",
  "You will lose the deposit if you leave before eleven months.",
  "You must pay the rent by the 5th of each month.",
  "You must report any loss of confidential information within 24 hours.",
  "The licensor may terminate the licence if rent is fifteen days late.",
  "The company may withhold the final settlement until the laptop is returned.",
  "A legal notice must be sent to the registered address.",
  "The employee is responsible for any damage to the equipment.",
  "Either party may terminate with one month's written notice.",
  "The non-compete lasts twelve months after you leave.",
  "The fine is ₹500 per day of delay.",
  "The guarantee period for repairs is thirty days.",
  "The document does not say who pays for repairs.",
  "Legal fees are payable by the losing party, the clause says.",
  "Check the right to terminate in clause 9.",
  // Possessives, court hypotheticals and conditions the document sets are not verdicts of ours.
  "You will sign the Company's standard Employee Confidentiality Agreement on joining.",
  "Devices may be monitored in accordance with the Company's Acceptable Use Policy.",
  "If any provision is held to be invalid, the remaining provisions continue in force.",
  "To the extent legally permitted, the receiving party gives prompt written notice.",
  "The clause says the landlord's reasonable costs of repair may be deducted.",
  // Restatements that use the new constructions' words without the verdict.
  "The agreement may be enforced by injunction, clause 8 says; ask what that would mean in practice.",
  "Clause 12 says the arbitrator's award is final and binding on both parties.",
  "The letter says the bond is payable if you leave within 24 months; check whether it is pro-rated.",
  "The deposit is due back within 30 days of handover, after the deductions listed in clause 3.2.",
  "Ask what the company owes you on the last working day: salary, leave encashment, reimbursements.",
  "Check the grounds that let the other side end it quickly, and what you would be owed or have to pay if that happens.",
  "",
];

const REVIEW_REGISTER_OK = [
  "Check when the deposit is due back and what can be deducted.",
  "The bond is ₹2,00,000 for 24 months; confirm whether it is pro-rated.",
  "Is the notice period the same for both sides?",
  "Ask whether the lock-in can be shortened before you sign.",
  "Before you sign, ask whether the lock-in can be shortened.",
  "The clause says the deposit is three months' fee. Ask whether any of it is adjustable against the last month.",
  "Clause 9 lets either side end it on one month's notice, so compare that with the lock-in in clause 2.",
  "Worth knowing: the arbitrator sits in Pune.",
  "You may want to ask how the eighteen days are counted.",
  "The letter does not mention gratuity.",
  "It is not clear whether the bonus is guaranteed.",
  "Demo output (mock model, not analysis): check the passage that begins \"4.1 The first six months\".",
];

const REVIEW_REGISTER_OFF = [
  "The deposit is three months' licence fee.",
  "Demo output (mock model, not analysis): this passage begins \"4.1 The first six months\".",
  "The notice period is one month from either side, per clause 7.2.",
  // Mentioning asking, reading or confirming is not the same as putting something to the reader.
  "The agreement asks you to repay ₹2 lakh if you leave early.",
  "The employer may request proof of identity.",
  "The clause says you must read the policy carefully.",
  "The agreement requires you to confirm attendance.",
  "The landlord may enter and request access to the meter.",
  "Either party may raise a dispute with the arbitrator named in clause 12.",
  "The tenant must make sure the premises are locked.",
  "If the tenant does not give notice, the deposit is forfeited.",
];

describe("RESPONSIBLE_LANGUAGE", () => {
  it("covers each register once, with a label, a rule and an alternative", () => {
    expect(RESPONSIBLE_LANGUAGE.map((r) => r.register)).toEqual([...LANGUAGE_REGISTERS]);
    for (const rule of RESPONSIBLE_LANGUAGE) {
      expect(rule.label.length).toBeGreaterThan(5);
      expect(rule.never.length).toBeGreaterThan(20);
      expect(rule.instead.length).toBeGreaterThan(20);
      expect(rule.patterns.length).toBeGreaterThan(0);
      for (const source of rule.patterns) expect(() => new RegExp(source, "u")).not.toThrow();
    }
  });

  for (const register of LANGUAGE_REGISTERS) {
    it(`catches ${register}`, () => {
      for (const text of CAUGHT[register]) {
        expect(registers(text), text).toContain(register);
      }
    });
  }

  it("lets neutral restatements and review-register sentences through", () => {
    for (const text of PASSES) {
      expect(findLanguageViolations(text), text).toEqual([]);
      expect(isResponsibleLanguage(text)).toBe(true);
    }
  });

  it("matches through typographic quotes, case and extra whitespace", () => {
    expect(registers("THIS   IS  ILLEGAL")).toEqual(["validity-verdict"]);
    expect(registers("Don’t   sign it")).toEqual(["directive-advice"]);
    expect(registers("It’s unfair")).toEqual(["fairness-judgement"]);
  });

  it("reports one entry per register, with the phrase and what to say instead", () => {
    const found = findLanguageViolations("This is illegal, so do not sign; you will win anyway.");
    expect(found.map((v) => v.register)).toEqual(["validity-verdict", "outcome-prediction", "directive-advice"]);
    const [verdict] = found;
    expect(verdict!.phrase).toBe("is illegal");
    expect(verdict!.label).toBe("a verdict on legality or validity");
    expect(verdict!.instead).toMatch(/check or confirm/);
    expect(describeLanguageViolation(verdict!)).toBe(
      `"is illegal" is a verdict on legality or validity; instead, ${verdict!.instead}`,
    );
  });

  it("keeps a reported phrase short so the detail can never echo a passage", () => {
    const long = `You ${"really ".repeat(30)}should refuse this.`;
    for (const violation of findLanguageViolations(long)) {
      expect(violation.phrase.length).toBeLessThanOrEqual(60);
    }
  });

  it("tells a review prompt from a bare statement", () => {
    for (const text of REVIEW_REGISTER_OK) expect(reviewRegisterIssue(text), text).toBeNull();
    for (const text of REVIEW_REGISTER_OFF) expect(reviewRegisterIssue(text), text).toMatch(/phrase it as a question or as something to check/);
    expect(reviewRegisterIssue("")).toBeNull();
  });

  it("generates the model instruction from the same rows", () => {
    const instruction = responsibleLanguageInstruction();
    for (const rule of RESPONSIBLE_LANGUAGE) expect(instruction).toContain(rule.never);
    expect(instruction).toMatch(/^Never \(a\) /);
    expect(instruction).toMatch(/check or confirm\.$/);
  });
});
