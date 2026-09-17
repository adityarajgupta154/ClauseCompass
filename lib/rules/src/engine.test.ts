import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { evaluateRules, matchRule, rulesForStage, summarizeFamilies } from "./engine";
import { RULE_FAMILIES } from "./registry";
import type { ClauseRule, RuleRegistry } from "./schema";

const baseRule = {
  title: "t",
  whyItMatters: "w",
} as const;

const payment: ClauseRule = {
  ...baseRule,
  id: "money.amount",
  family: "money",
  category: "payment",
  detection: {
    any: [String.raw`(?<amount>INR [\d,]+)`],
    all: [String.raw`\bpay\b`],
    none: [String.raw`\bdeposit\b`],
  },
  stages: { "before-signing": "primary", "compare-versions": "secondary" },
  reviewPrompt: "check {clause}: {amount|the amount} is due.",
};

const notice: ClauseRule = {
  ...baseRule,
  id: "exit.notice",
  family: "exit",
  category: "notice",
  detection: { any: [String.raw`(?<period>\d+ days)'? notice`] },
  stages: { "problem-started": "primary", "before-signing": "secondary" },
  documentTypes: ["rental"],
  reviewPrompt: "Check {clause}: it needs {period|some} notice.",
};

const dated: ClauseRule = {
  ...baseRule,
  id: "time.dated",
  family: "time",
  category: "date",
  detection: { any: [String.raw`\b\d{4}\b`] },
  stages: { "compare-versions": "primary" },
  reviewPrompt: "Check {clause}: it has a date.",
};

const registry: RuleRegistry = {
  version: "2026-01-01",
  language: "en",
  families: [...RULE_FAMILIES],
  rules: [payment, notice, dated],
};

const chunks = [
  { text: "1. FEES", id: "h1" },
  {
    text: "1.1 The Licensee shall pay INR 18,000 on the 5th of each month.",
    id: "c1",
  },
  { text: "1.2 The Licensee shall pay a deposit of INR 54,000.", id: "c2" },
  {
    text: "2.1 Either party may end this on 30 days' notice; signed 2026.",
    id: "c3",
  },
  { text: "   ", id: "blank" },
];

describe("evaluateRules", () => {
  it("produces a hit with the match, captures and a rendered prompt", () => {
    const [hit] = evaluateRules(chunks, { registry }).filter((h) => h.ruleId === "money.amount");
    expect(hit).toMatchObject({
      ruleId: "money.amount",
      family: "money",
      category: "payment",
      registryVersion: "2026-01-01",
      chunkIndex: 1,
      clause: { kind: "clause", label: "1.1" },
      matched: "INR 18,000",
      captures: { amount: "INR 18,000" },
      relevance: null,
      reviewPrompt: "Check clause 1.1: INR 18,000 is due.",
    });
    expect(hit!.chunk).toBe(chunks[1]);
  });

  it("requires every `all` pattern and rejects any `none` pattern", () => {
    const hits = evaluateRules(chunks, { registry });
    expect(hits.filter((h) => h.ruleId === "money.amount").map((h) => h.chunkIndex)).toEqual([1]);
    expect(matchRule(payment, "INR 500 is mentioned")).toBeNull();
    expect(matchRule(payment, "pay INR 500")).toEqual({
      matched: "INR 500",
      captures: { amount: "INR 500" },
    });
  });

  it("skips headings and blank chunks", () => {
    const hits = evaluateRules(chunks, { registry });
    expect(hits.some((h) => h.chunkIndex === 0 || h.chunkIndex === 4)).toBe(false);
  });

  it("falls back in the prompt when a capture is absent", () => {
    const hits = evaluateRules([{ text: "Gives notice of 3 days notice" }], {
      registry,
    });
    const hit = hits.find((h) => h.ruleId === "exit.notice");
    expect(hit?.reviewPrompt).toBe("Check this clause: it needs 3 days notice.");
    const noLabel = evaluateRules([{ text: "It says 2026 somewhere." }], {
      registry,
    });
    expect(noLabel[0]?.reviewPrompt).toBe("Check this clause: it has a date.");
  });

  it("applies document-type scoping only when the type is known", () => {
    const ids = (documentType?: "rental" | "nda") =>
      evaluateRules(chunks, { registry, documentType }).map((h) => h.ruleId);
    expect(ids()).toContain("exit.notice");
    expect(ids("rental")).toContain("exit.notice");
    expect(ids("nda")).not.toContain("exit.notice");
    expect(ids("nda")).toContain("money.amount");
  });

  it("orders by document position when no stage is given", () => {
    const hits = evaluateRules(chunks, { registry });
    expect(hits.map((h) => [h.chunkIndex, h.ruleId])).toEqual([
      [1, "money.amount"],
      [3, "exit.notice"],
      [3, "time.dated"],
    ]);
    expect(hits.every((h) => h.relevance === null)).toBe(true);
  });

  it("orders primary, secondary, then background for a stage", () => {
    const hits = evaluateRules(chunks, { registry, stage: "problem-started" });
    expect(hits.map((h) => [h.ruleId, h.relevance])).toEqual([
      ["exit.notice", "primary"],
      ["money.amount", "background"],
      ["time.dated", "background"],
    ]);
    const compare = evaluateRules(chunks, {
      registry,
      stage: "compare-versions",
    });
    expect(compare.map((h) => [h.ruleId, h.relevance])).toEqual([
      ["time.dated", "primary"],
      ["money.amount", "secondary"],
      ["exit.notice", "background"],
    ]);
  });

  it("merges captures across matching patterns, first value wins", () => {
    const rule: ClauseRule = {
      ...baseRule,
      id: "time.window",
      family: "time",
      category: "deadline",
      detection: {
        any: [String.raw`within (?<window>\d+ days)`, String.raw`(?<window>\d+ weeks)`, String.raw`(?<who>landlord)`],
      },
      stages: { "before-signing": "primary" },
      reviewPrompt: "Check {window} / {who|nobody}",
    };
    expect(matchRule(rule, "the landlord replies within 7 days or 2 weeks")).toEqual({
      matched: "within 7 days",
      captures: { window: "7 days", who: "landlord" },
    });
  });

  it("refuses an invalid custom registry", () => {
    const bad = { ...registry, rules: [{ ...payment, id: "not a valid id" }] };
    expect(() => evaluateRules(chunks, { registry: bad })).toThrow(ZodError);
  });

  it("refuses registries that break the engine's invariants", () => {
    const cases: Array<[string, RuleRegistry]> = [
      ["no rules", { ...registry, rules: [] }],
      ["duplicate rule id", { ...registry, rules: [payment, { ...payment, category: "other" }] }],
      ["id not prefixed with its family", { ...registry, rules: [{ ...payment, id: "time.amount" }] }],
      ["a family listed twice", { ...registry, families: [...RULE_FAMILIES.slice(0, 4), RULE_FAMILIES[0]!] }],
      ["placeholder nobody captures", { ...registry, rules: [{ ...payment, reviewPrompt: "{clause} {rate|x}" }] }],
      [
        "capture placeholder without fallback",
        { ...registry, rules: [{ ...payment, reviewPrompt: "{clause} {amount}" }] },
      ],
    ];
    for (const [label, bad] of cases) {
      expect(() => evaluateRules(chunks, { registry: bad }), label).toThrow(ZodError);
    }
  });

  it("does not mistake text in an uncased script for a heading", () => {
    const hindi = "1.1 किरायेदार 30 days notice देगा।";
    expect(
      evaluateRules([{ text: hindi }, { text: "किरायानामा" }], { registry }).map((h) => [h.ruleId, h.chunkIndex]),
    ).toEqual([["exit.notice", 0]]);
  });

  it("matches straight and typographic apostrophes alike", () => {
    const rule: ClauseRule = {
      ...notice,
      detection: { any: [String.raw`(?<period>\d+ days)['’]? notice`] },
    };
    const custom = { ...registry, rules: [rule] };
    expect(
      evaluateRules([{ text: "on 30 days’ notice" }, { text: "on 30 days' notice" }], { registry: custom }),
    ).toHaveLength(2);
  });

  it("refuses a registry whose pattern does not compile", () => {
    const bad: RuleRegistry = {
      ...registry,
      rules: [{ ...dated, detection: { any: ["("] } }],
    };
    expect(() => evaluateRules(chunks, { registry: bad })).toThrow(SyntaxError);
  });

  it("returns no hits for no chunks", () => {
    expect(evaluateRules([], { registry })).toEqual([]);
  });
});

describe("summarizeFamilies", () => {
  it("lists every family, most hits first, with distinct chunks and rules", () => {
    const hits = evaluateRules([...chunks, { text: "3.1 Also pay INR 1 by 2027.", id: "c4" }], { registry });
    const summary = summarizeFamilies(hits, registry);
    expect(summary.map((s) => [s.family, s.hitCount])).toEqual([
      ["money", 2],
      ["time", 2],
      ["exit", 1],
      ["duty", 0],
      ["data-ip", 0],
    ]);
    expect(summary[0]).toMatchObject({
      label: "Money",
      chunkIndexes: [1, 5],
      ruleIds: ["money.amount"],
    });
    expect(summary[1]).toMatchObject({
      chunkIndexes: [3, 5],
      ruleIds: ["time.dated"],
    });
  });
});

describe("rulesForStage", () => {
  it("returns the rules listed for a stage, primary first, in registry order", () => {
    expect(rulesForStage("before-signing", registry).map((r) => [r.rule.id, r.relevance])).toEqual([
      ["money.amount", "primary"],
      ["exit.notice", "secondary"],
    ]);
    expect(rulesForStage("problem-started", registry).map((r) => r.rule.id)).toEqual(["exit.notice"]);
  });
});
