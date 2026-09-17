import { describe, expect, it } from "vitest";
import { documentToAnalyse, slotToAnalyse } from "./select-document";

const file = (name: string) => new File(["x"], name);

describe("documentToAnalyse", () => {
  it("maps a single document to the primary slot", () => {
    expect(slotToAnalyse("before-signing")).toBe("primary");
    expect(slotToAnalyse("problem-started")).toBe("primary");
    expect(documentToAnalyse("problem-started", { primary: file("a.pdf") })?.name).toBe("a.pdf");
  });

  it("maps a version comparison to the newer version", () => {
    expect(slotToAnalyse("compare-versions")).toBe("newer");
    expect(documentToAnalyse("compare-versions", { older: file("v1.pdf"), newer: file("v2.pdf") })?.name).toBe("v2.pdf");
  });

  it("is null when the slot is empty", () => {
    expect(documentToAnalyse("compare-versions", { older: file("v1.pdf") })).toBeNull();
  });
});
