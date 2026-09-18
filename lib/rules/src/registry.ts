import { deepFreeze } from "./freeze";
import { DATA_IP_RULES } from "./registry/data-ip";
import { DUTY_RULES } from "./registry/duty";
import { EXIT_RULES } from "./registry/exit";
import { MONEY_RULES } from "./registry/money";
import { TIME_RULES } from "./registry/time";
import type { RuleFamily, RuleRegistry } from "./schema";

/**
 * The clause-rule registry (PRD §7.1 / §8): what the product looks for in a
 * document, family by family, as data. Each rule says how a clause is
 * detected, which stage it matters most at, and what a reader should check
 * about it in plain words. The engine in engine.ts is the only interpreter;
 * no model ever sees these patterns.
 *
 * Conventions:
 * - Patterns are regular-expression sources compiled with the `iu` flags.
 *   Named groups (`period`, `amount`, `window`) are captured into the hit and
 *   can be used in the review prompt as `{name|fallback}`.
 * - `stages` lists where a rule leads (`primary`) or supports (`secondary`);
 *   a stage that is absent still gets the hit, as background.
 * - `documentTypes` narrows a rule to the document kinds it makes sense for.
 * - Review prompts speak to the reader, tell them what to check, and never
 *   say whether a clause is valid, fair or enforceable.
 *
 * The PRD's own clause-rule table was not carried into docs/PRD.md; this
 * registry is derived from its document-map fields (FR-04: parties, dates,
 * money, duties, termination, dispute wording), its change classes (FR-07:
 * money/time/duty/remedy) and the stage table in §8.
 */


export const RULE_FAMILIES: readonly RuleFamily[] = [
  {
    id: "money",
    label: "Money",
    description: "What you pay or receive: amounts, deposits, penalties, pay-backs and who covers extra costs.",
  },
  {
    id: "time",
    label: "Time",
    description:
      "How long things last and by when they must happen: term, deadlines, renewals, probation and what survives the end.",
  },
  {
    id: "duty",
    label: "Duty",
    description: "What you must do or must not do, and what the other side may decide on their own.",
  },
  {
    id: "exit",
    label: "Exit & remedies",
    description:
      "How either side can leave, what it costs to leave early, and what can be claimed if something goes wrong.",
  },
  {
    id: "data-ip",
    label: "Data & IP",
    description: "Secrets you must keep, who owns what you create, and what happens to your personal information.",
  },
];

/** Freezes the registry through every nested array and object. */
export const RULE_REGISTRY: RuleRegistry = deepFreeze({
  version: "2026-09-14",
  language: "en",
  families: [...RULE_FAMILIES],
  rules: [...MONEY_RULES, ...TIME_RULES, ...DUTY_RULES, ...EXIT_RULES, ...DATA_IP_RULES],
});
