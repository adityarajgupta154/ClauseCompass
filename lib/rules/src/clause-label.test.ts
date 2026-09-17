import { describe, expect, it } from "vitest";
import { describeClause, detectClauseLabel, isHeading } from "./clause-label";

describe("detectClauseLabel", () => {
  it("reads numbered clauses", () => {
    expect(detectClauseLabel("4.2 After the lock-in period, either party may terminate")).toEqual({
      kind: "clause",
      label: "4.2",
    });
    expect(detectClauseLabel("10.1 This offer and your continued employment")).toEqual({
      kind: "clause",
      label: "10.1",
    });
    expect(detectClauseLabel("  2.3.1 Sub-clause text")).toEqual({
      kind: "clause",
      label: "2.3.1",
    });
    expect(detectClauseLabel("4. LOCK-IN PERIOD AND TERMINATION")).toEqual({
      kind: "clause",
      label: "4",
    });
  });

  it("reads recitals and schedules", () => {
    expect(detectClauseLabel("A. The Disclosing Party provides data-platform consulting")).toEqual({
      kind: "recital",
      label: "A",
    });
    expect(detectClauseLabel("SCHEDULE I - FITTINGS AND FIXTURES HANDED OVER")).toEqual({
      kind: "schedule",
      label: "SCHEDULE I",
    });
    expect(detectClauseLabel("Annexure  B - DOCUMENTS TO BE SUBMITTED")).toEqual({
      kind: "schedule",
      label: "Annexure B",
    });
  });

  it("returns null for unlabelled text", () => {
    expect(detectClauseLabel("The Licensee shall pay to the Licensor")).toBeNull();
    expect(detectClauseLabel("Date: 20 September 2026")).toBeNull();
    expect(detectClauseLabel("")).toBeNull();
  });
});

describe("describeClause", () => {
  it("phrases the label for a review prompt", () => {
    expect(describeClause({ kind: "clause", label: "4.2" })).toBe("clause 4.2");
    expect(describeClause({ kind: "recital", label: "A" })).toBe("recital A");
    expect(describeClause({ kind: "schedule", label: "Schedule I" })).toBe("Schedule I");
    expect(describeClause(null)).toBe("this clause");
  });
});

describe("isHeading", () => {
  it("treats short all-caps paragraphs as headings", () => {
    expect(isHeading("BETWEEN")).toBe(true);
    expect(isHeading("4. LOCK-IN PERIOD AND TERMINATION")).toBe(true);
    expect(isHeading("IT IS AGREED AS FOLLOWS:")).toBe(true);
    expect(isHeading("SCHEDULE I - FITTINGS AND FIXTURES HANDED OVER")).toBe(true);
  });

  it("never treats mixed-case or long text as a heading", () => {
    expect(isHeading("4.2 After the lock-in period, either party may terminate")).toBe(false);
    expect(isHeading("SIGNED AND DELIVERED by the within named LICENSOR")).toBe(false);
    expect(
      isHeading("THE LICENSEE SHALL NOT SUB-LET ASSIGN OR PART WITH POSSESSION OF THE PREMISES OR ANY PART THEREOF"),
    ).toBe(false);
  });

  it("ignores paragraphs with no letters", () => {
    expect(isHeading("______________________")).toBe(false);
    expect(isHeading("   ")).toBe(false);
  });
});
