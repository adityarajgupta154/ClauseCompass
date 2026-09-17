import { describe, expect, it } from "vitest";
import { MAX_TOKEN_LENGTH, SPELLINGS, STOPWORDS, analyzeDocument, isStopword, termOf, tokenize } from "./tokenize";

describe("tokenize", () => {
  it("lowercases and splits on punctuation, keeping digits and Devanagari words whole", () => {
    expect(tokenize("Lock-in period: the Licensee's flat, Rs. 18,000/- e-mail किराया ३ महीने I A 5")).toEqual([
      "lock",
      "in",
      "period",
      "the",
      "licensees",
      "flat",
      "rs",
      "18000",
      "mail",
      "किराया",
      "३",
      "महीने",
      "5",
    ]);
  });

  it("joins Indian digit groups and keeps other commas as separators", () => {
    expect(tokenize("INR 2,00,000 (Rupees Two Lakh only), payable")).toEqual([
      "inr",
      "200000",
      "rupees",
      "two",
      "lakh",
      "only",
      "payable",
    ]);
  });

  it("normalises compatibility characters and drops single letters", () => {
    expect(tokenize("ﬁne print, ①")).toEqual(["fine", "print", "1"]);
    expect(tokenize("a b c 1 2")).toEqual(["1", "2"]);
    expect(tokenize("")).toEqual([]);
  });

  it("treats straight and curly apostrophes alike, so contractions and possessives are whole words", () => {
    expect(tokenize("don't won't isn't")).toEqual(["dont", "wont", "isnt"]);
    expect(tokenize("don\u2019t won\u2019t isn\u02BCt")).toEqual(["dont", "wont", "isnt"]);
    expect(tokenize("the Licensee's party's Licensor\u2019s")).toEqual(["the", "licensees", "partys", "licensors"]);
    expect(analyzeDocument("Licensee's")).toEqual(analyzeDocument("licensee"));
    expect(analyzeDocument("party's")).toEqual(analyzeDocument("parties"));
    expect(analyzeDocument("I don\u2019t").every((t) => !isStopword(t) || t === "dont")).toBe(true);
    expect(isStopword("dont")).toBe(true);
  });

  it("drops over-long tokens instead of spending time on them", () => {
    const blob = "y".repeat(20_000);
    expect(tokenize(`notice ${blob} period`)).toEqual(["notice", "period"]);
    expect(tokenize("x".repeat(MAX_TOKEN_LENGTH))).toHaveLength(1);
    expect(tokenize("x".repeat(MAX_TOKEN_LENGTH + 1))).toEqual([]);
    const started = Date.now();
    expect(analyzeDocument(`${blob} ${"terminated ".repeat(2_000)}`)).toHaveLength(2_000);
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});

describe("terms", () => {
  it("folds American spellings before stemming", () => {
    expect(termOf("license")).toBe(termOf("licence"));
    expect(termOf("licenses")).toBe(termOf("licences"));
    expect(termOf("judgment")).toBe(termOf("judgement"));
    for (const [american, british] of Object.entries(SPELLINGS)) expect(termOf(american)).toBe(termOf(british));
  });

  it("keeps stopwords in documents so a stopword can never be a missing posting", () => {
    expect(analyzeDocument("Notices; noticed; the termination was terminated")).toEqual([
      "notic",
      "notic",
      "the",
      "termin",
      "wa",
      "termin",
    ]);
  });
});

describe("stopwords", () => {
  it("cover English, Hinglish and Devanagari function words but no contract words", () => {
    for (const word of ["the", "what", "is", "kya", "hai", "kitna", "mein", "है", "कितना", "में", "non"]) {
      expect(isStopword(word), word).toBe(true);
    }
    for (const word of ["notice", "deposit", "rent", "kiraya", "din", "mahine", "किराया", "नोटिस", "days", "15"]) {
      expect(isStopword(word), word).toBe(false);
    }
  });

  it("are all tokens of the tokenizer's own shape, so a lookup can never miss on form", () => {
    for (const word of STOPWORDS) expect(tokenize(word), word).toEqual([word]);
  });
});
