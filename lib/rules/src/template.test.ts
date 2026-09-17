import { describe, expect, it } from "vitest";
import { renderTemplate, templatePlaceholders } from "./template";

describe("renderTemplate", () => {
  it("fills placeholders from values", () => {
    expect(
      renderTemplate("Check {clause} for {period}.", {
        clause: "clause 4.2",
        period: "one (1) month",
      }),
    ).toBe("Check clause 4.2 for one (1) month.");
  });

  it("uses the fallback when the value is missing or blank", () => {
    expect(renderTemplate("({period|check the period})", {})).toBe("(check the period)");
    expect(renderTemplate("({period|check the period})", { period: "   " })).toBe("(check the period)");
    expect(renderTemplate("({period|})", {})).toBe("()");
  });

  it("trims values and leaves unknown placeholders without a fallback in place", () => {
    expect(renderTemplate("{amount}", { amount: " INR 500 " })).toBe("INR 500");
    expect(renderTemplate("{missing} stays", {})).toBe("{missing} stays");
  });

  it("does not treat braces without a name as placeholders", () => {
    expect(renderTemplate("{} {1} {a b}", {})).toBe("{} {1} {a b}");
  });
});

describe("templatePlaceholders", () => {
  it("lists each placeholder name once, without fallbacks", () => {
    expect(templatePlaceholders("{clause} {period|x} {clause} {amount}")).toEqual(["clause", "period", "amount"]);
    expect(templatePlaceholders("no placeholders")).toEqual([]);
  });
});
