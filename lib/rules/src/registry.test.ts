import { findLanguageViolations } from "@workspace/grounding";
import { describe, expect, it } from "vitest";
import { STAGE_IDS, isDocumentTypeId, isStageId } from "./contract";
import { compilePattern } from "./engine";
import { RULE_FAMILIES, RULE_REGISTRY } from "./registry";
import { RULE_FAMILY_IDS, ruleRegistrySchema } from "./schema";
import { renderTemplate, templatePlaceholders } from "./template";

/**
 * Structural checks on the shipped registry. Behavioural checks against the
 * synthetic documents live in tests/golden/clause-rules.test.ts.
 */

const NAMED_GROUP = /\(\?<([a-zA-Z][a-zA-Z0-9_]*)>/g;

function patternsOf(rule: (typeof RULE_REGISTRY)["rules"][number]): string[] {
  return [...rule.detection.any, ...(rule.detection.all ?? []), ...(rule.detection.none ?? [])];
}

describe("RULE_REGISTRY", () => {
  it("matches its schema", () => {
    expect(() => ruleRegistrySchema.parse(RULE_REGISTRY)).not.toThrow();
  });

  it("is frozen all the way down, so the compiled cache cannot go stale", () => {
    expect(Object.isFrozen(RULE_REGISTRY)).toBe(true);
    expect(Object.isFrozen(RULE_REGISTRY.rules)).toBe(true);
    for (const rule of RULE_REGISTRY.rules) {
      expect(Object.isFrozen(rule.detection.any)).toBe(true);
      expect(Object.isFrozen(rule.stages)).toBe(true);
    }
    expect(() => {
      (RULE_REGISTRY.rules as unknown[]).push({});
    }).toThrow(TypeError);
  });

  it("lists the five families once each, in the fixed order", () => {
    expect(RULE_REGISTRY.families.map((f) => f.id)).toEqual([...RULE_FAMILY_IDS]);
    expect(RULE_REGISTRY.families).toEqual(RULE_FAMILIES);
  });

  it("gives every rule a unique id prefixed with its family", () => {
    const ids = RULE_REGISTRY.rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of RULE_REGISTRY.rules) expect(rule.id.startsWith(`${rule.family}.`)).toBe(true);
  });

  it("has at least three rules in every family", () => {
    for (const family of RULE_FAMILY_IDS) {
      expect(RULE_REGISTRY.rules.filter((r) => r.family === family).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("compiles every pattern with the engine's flags", () => {
    for (const rule of RULE_REGISTRY.rules) {
      for (const source of patternsOf(rule))
        expect(() => compilePattern(source), `${rule.id}: ${source}`).not.toThrow();
    }
  });

  it("marks every rule as relevant at some stage, and at known stages only", () => {
    for (const rule of RULE_REGISTRY.rules) {
      const stages = Object.keys(rule.stages);
      expect(stages.length, rule.id).toBeGreaterThan(0);
      for (const stage of stages) expect(isStageId(stage), `${rule.id}: ${stage}`).toBe(true);
    }
  });

  it("covers every stage with primary rules from more than one family", () => {
    for (const stage of STAGE_IDS) {
      const primaryFamilies = new Set(
        RULE_REGISTRY.rules.filter((r) => r.stages[stage] === "primary").map((r) => r.family),
      );
      expect(primaryFamilies.size, stage).toBeGreaterThan(1);
    }
  });

  it("scopes document types to known ids", () => {
    for (const rule of RULE_REGISTRY.rules) {
      for (const type of rule.documentTypes ?? []) expect(isDocumentTypeId(type), rule.id).toBe(true);
    }
  });

  it("only uses placeholders it can fill, with fallbacks for captures", () => {
    for (const rule of RULE_REGISTRY.rules) {
      const groups = new Set<string>();
      for (const source of patternsOf(rule)) {
        for (const match of source.matchAll(NAMED_GROUP)) groups.add(match[1]!);
      }
      for (const name of templatePlaceholders(rule.reviewPrompt)) {
        if (name === "clause") continue;
        expect(groups.has(name), `${rule.id} uses {${name}} but no pattern captures it`).toBe(true);
        expect(rule.reviewPrompt, `${rule.id}: {${name}} needs a fallback`).toMatch(
          new RegExp(`\\{${name}\\|[^}]*\\}`),
        );
      }
    }
  });

  it("names the clause in every review prompt and stays in the review register (PRD §8, FR-06)", () => {
    for (const rule of RULE_REGISTRY.rules) {
      expect(rule.reviewPrompt, rule.id).toContain("{clause}");
      for (const text of [rule.title, rule.whyItMatters, renderTemplate(rule.reviewPrompt, { clause: "clause 1" })]) {
        expect(findLanguageViolations(text), `${rule.id}: ${text}`).toEqual([]);
      }
    }
    for (const family of RULE_FAMILIES) {
      expect(findLanguageViolations(family.description), family.id).toEqual([]);
    }
  });

  it("refuses a registry whose prompt gives a verdict, naming the words", () => {
    const [first, ...rest] = RULE_REGISTRY.rules;
    const bad = {
      ...RULE_REGISTRY,
      rules: [{ ...first!, reviewPrompt: "Read {clause}: this deduction is illegal, do not sign." }, ...rest],
    };
    const result = ruleRegistrySchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (result.success) return;
    const messages = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    expect(messages).toContainEqual(expect.stringMatching(/^rules\.0\.reviewPrompt: "is illegal" is a verdict/));
    expect(messages).toContainEqual(expect.stringMatching(/^rules\.0\.reviewPrompt: "do not sign" is advice/));
  });

  it("refuses a registry whose prompt only describes the clause without putting anything to the reader", () => {
    const [first, ...rest] = RULE_REGISTRY.rules;
    const bad = { ...RULE_REGISTRY, rules: [{ ...first!, reviewPrompt: "{clause} sets the deposit at three months' fee." }, ...rest] };
    const result = ruleRegistrySchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (result.success) return;
    const messages = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    expect(messages).toContainEqual(expect.stringMatching(/^rules\.0\.reviewPrompt: The wording states a fact but puts nothing to the reader/));
  });

  it("keeps every rendered template within a claim's text limit", () => {
    // The longest label the engine produces is about 40 characters ("the paragraph starting ..." forms).
    for (const rule of RULE_REGISTRY.rules) {
      const rendered = renderTemplate(rule.reviewPrompt, { clause: "the paragraph beginning \"Whereas the Licensee\"" });
      expect(rendered.length, rule.id).toBeLessThanOrEqual(400);
    }
  });
});
