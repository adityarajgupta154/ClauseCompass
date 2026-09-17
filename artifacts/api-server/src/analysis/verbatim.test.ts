import { describe, expect, it } from "vitest";
import { groundedClaimSchema, MODEL_OUTPUT_LIMITS, type SourceChunk } from "@workspace/grounding";
import { sentenceAt, spanOf, verbatimClaim, windowAround } from "./verbatim";

const chunk = (text: string): SourceChunk => ({ id: "p9", text, location: { page: 2, paragraph: 9, clause: "3.2" } });

describe("sentenceAt", () => {
  const text =
    "3.2 The Licensee shall pay Rs. 18,000/- to Mr. Kulkarni on the 5th of each month. Late payment attracts interest at 18% p.a. The Licensor may deduct dues (see clause 3.1). No other charge applies.";

  it("returns the sentence around an offset, not splitting on abbreviations", () => {
    const at = text.indexOf("Kulkarni");
    const span = sentenceAt(text, at);
    expect(text.slice(span.start, span.end)).toBe(
      "3.2 The Licensee shall pay Rs. 18,000/- to Mr. Kulkarni on the 5th of each month.",
    );
  });

  it("finds middle and last sentences, including one that ends with a bracket", () => {
    const late = sentenceAt(text, text.indexOf("Late"));
    expect(text.slice(late.start, late.end)).toBe("Late payment attracts interest at 18% p.a.");
    const bracket = sentenceAt(text, text.indexOf("deduct"));
    expect(text.slice(bracket.start, bracket.end)).toBe("The Licensor may deduct dues (see clause 3.1).");
    const last = sentenceAt(text, text.indexOf("No other"));
    expect(text.slice(last.start, last.end)).toBe("No other charge applies.");
  });

  it("treats a danda as a sentence end", () => {
    const hindi = "यह अनुबंध पुणे में किया गया। किरायेदार किराया देगा।";
    const span = sentenceAt(hindi, hindi.indexOf("किरायेदार"));
    expect(hindi.slice(span.start, span.end)).toBe("किरायेदार किराया देगा।");
  });
});

describe("windowAround", () => {
  const text = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
  const bounds = { start: 0, end: text.length };

  it("returns the bounds when they fit", () => {
    expect(windowAround(text, bounds, { start: 0, end: 5 }, 1000)).toEqual(bounds);
  });

  it("cuts to whole words around the focus, always containing it", () => {
    const focus = spanOf(text, "word30")!;
    const span = windowAround(text, bounds, focus, 60);
    const shown = text.slice(span.start, span.end);
    expect(shown.length).toBeLessThanOrEqual(60);
    expect(shown).toContain("word30");
    expect(shown.startsWith("word")).toBe(true);
    expect(/^word\d+( word\d+)*$/.test(shown)).toBe(true);
  });
});

describe("verbatimClaim", () => {
  it("builds a grounded claim from the sentence around a match, quoting the match", () => {
    const text = "This Agreement is made on 24th day of February 2026. It runs for eleven months.";
    const match = spanOf(text, "24th day of February 2026")!;
    const claim = verbatimClaim(chunk(text), match, "date", { quote: "match" });
    expect(groundedClaimSchema.parse(claim)).toEqual(claim);
    expect(claim).toEqual({
      text: "This Agreement is made on 24th day of February 2026.",
      quote: "24th day of February 2026",
      source_chunk_ids: ["p9"],
      location: { page: 2, paragraph: 9, clause: "3.2" },
      confidence: 1,
      category: "date",
    });
  });

  it("quotes the sentence itself when asked, within the contract's quote length", () => {
    const long = `The Licensee agrees ${"to keep the premises in good condition and ".repeat(12)}at all times.`;
    const match = spanOf(long, "good condition")!;
    const claim = verbatimClaim(chunk(long), match, "upkeep", { quote: "sentence" });
    expect(claim.quote.length).toBeLessThanOrEqual(MODEL_OUTPUT_LIMITS.quoteChars);
    expect(long).toContain(claim.quote);
    expect(claim.quote).toContain("good condition");
    // Display text is clipped with ellipses when the sentence is longer than a claim may be.
    expect(claim.text.length).toBeLessThanOrEqual(MODEL_OUTPUT_LIMITS.claimTextChars);
    expect(claim.text.startsWith("\u2026") || claim.text.endsWith("\u2026")).toBe(true);
    expect(long).toContain(claim.text.replace(/\u2026/g, ""));
  });

  it("refuses a match outside the chunk", () => {
    expect(() => verbatimClaim(chunk("short"), { start: 2, end: 40 }, "date", { quote: "match" })).toThrow(RangeError);
  });
});
