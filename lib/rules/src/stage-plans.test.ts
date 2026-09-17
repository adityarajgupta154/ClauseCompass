import { describe, expect, it } from "vitest";
import { STAGE_IDS } from "./contract";
import { rulesForStage } from "./engine";
import { RULE_REGISTRY } from "./registry";
import { RULE_FAMILY_IDS } from "./schema";
import { INTERVIEW_ASKS, OUTPUT_KINDS, STAGE_PLANS, lookForRules } from "./stage-plans";

describe("stage plans", () => {
  it("has one frozen plan per stage that names every family once and only known asks and outputs", () => {
    expect(Object.keys(STAGE_PLANS).sort()).toEqual([...STAGE_IDS].sort());
    for (const stage of STAGE_IDS) {
      const plan = STAGE_PLANS[stage];
      expect(plan.stage).toBe(stage);
      expect(Object.isFrozen(plan)).toBe(true);
      expect([...plan.families].sort()).toEqual([...RULE_FAMILY_IDS].sort());
      for (const ask of plan.asks) expect(INTERVIEW_ASKS).toContain(ask);
      for (const output of plan.outputs) expect(OUTPUT_KINDS).toContain(output);
      expect(new Set(plan.asks).size).toBe(plan.asks.length);
      expect(new Set(plan.outputs).size).toBe(plan.outputs.length);
    }
  });

  it("agrees with the registry: the family a plan leads with has primary rules at that stage", () => {
    for (const stage of STAGE_IDS) {
      const lead = STAGE_PLANS[stage].families[0];
      const primaries = rulesForStage(stage).filter((entry) => entry.relevance === "primary");
      expect(
        primaries.some((entry) => entry.rule.family === lead),
        stage,
      ).toBe(true);
    }
  });

  it("orders look-for rules: all primary rules first, each block in the plan's family order, registry order within a family", () => {
    for (const stage of STAGE_IDS) {
      const plan = STAGE_PLANS[stage];
      const ids = lookForRules(stage);
      const listed = rulesForStage(stage);
      expect(ids).toHaveLength(listed.length);
      expect(new Set(ids).size).toBe(ids.length);
      const byId = new Map(RULE_REGISTRY.rules.map((rule, index) => [rule.id, { rule, index }]));
      const primaryCount = listed.filter((entry) => entry.relevance === "primary").length;
      for (const block of [ids.slice(0, primaryCount), ids.slice(primaryCount)]) {
        let previous: { family: number; index: number } | null = null;
        for (const id of block) {
          const { rule, index } = byId.get(id)!;
          const current = { family: plan.families.indexOf(rule.family), index };
          if (previous) {
            expect(current.family >= previous.family, `${stage}: ${id}`).toBe(true);
            if (current.family === previous.family)
              expect(current.index > previous.index, `${stage}: ${id}`).toBe(true);
          }
          previous = current;
        }
      }
      for (const id of ids.slice(0, primaryCount)) expect(byId.get(id)!.rule.stages[stage]).toBe("primary");
    }
  });
});
