import { LOW_CONFIDENCE_BELOW } from "@workspace/grounding";
import { describe, expect, it } from "vitest";
import { decideAnswer, tidyQuestion } from "./answer";

describe("decideAnswer", () => {
  it("refuses when nothing in the document supports the question", () => {
    expect(decideAnswer({ question: "Can I sublet?", chunkIds: [], confidence: 0.99 })).toMatchObject({
      kind: "no-evidence",
      reason: "no-evidence",
    });
    expect(decideAnswer({ question: "Can I sublet?", chunkIds: ["", "  "], confidence: null })).toMatchObject({
      kind: "no-evidence",
      reason: "no-evidence",
    });
  });

  it("refuses below the contract's confidence floor, and only there", () => {
    expect(LOW_CONFIDENCE_BELOW).toBe(0.6);
    expect(decideAnswer({ question: "q", chunkIds: ["c"], confidence: LOW_CONFIDENCE_BELOW - 0.01 })).toMatchObject({
      kind: "no-evidence",
      reason: "low-confidence",
    });
    expect(decideAnswer({ question: "q", chunkIds: ["c"], confidence: LOW_CONFIDENCE_BELOW })).toMatchObject({
      kind: "grounded-answer",
    });
    expect(decideAnswer({ question: "q", chunkIds: ["c"], confidence: 1 })).toMatchObject({ kind: "grounded-answer" });
    expect(decideAnswer({ question: "q", chunkIds: ["c"], confidence: Number.NaN })).toMatchObject({
      kind: "no-evidence",
      reason: "low-confidence",
    });
  });

  it("treats an unknown confidence as acceptable when there is evidence", () => {
    expect(decideAnswer({ question: "q", chunkIds: ["c"], confidence: null })).toEqual({
      kind: "grounded-answer",
      style: "full",
      chunkIds: ["c"],
    });
  });

  it("carries the answer style the flow decided", () => {
    expect(decideAnswer({ question: "q", chunkIds: ["c"], confidence: 0.9 }, { answerStyle: "brief" })).toMatchObject({
      style: "brief",
    });
  });

  it("hands back the reader's own question for a professional, tidied but not rewritten", () => {
    const refused = decideAnswer({
      question: "  kya   main deposit\nwapas maang sakta hoon ",
      chunkIds: [],
      confidence: null,
    });
    expect(refused).toMatchObject({
      kind: "no-evidence",
      message: "document-does-not-answer",
      suggestedQuestion: { frame: "ask-a-professional", question: "kya main deposit wapas maang sakta hoon?" },
    });
    expect(tidyQuestion("Is it legal?")).toBe("Is it legal?");
    expect(tidyQuestion("क्या यह सही है।")).toBe("क्या यह सही है।");
    expect(tidyQuestion("   ")).toBe("");
  });
});
