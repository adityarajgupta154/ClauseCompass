import { describeLanguageViolation, findLanguageViolations, reviewRegisterIssue } from "@workspace/grounding";
import { z } from "zod";
import { DOCUMENT_TYPES, STAGE_IDS } from "./contract";
import { renderTemplate, templatePlaceholders } from "./template";

/**
 * Shape of the clause-rule registry (PRD §7.1 "hand-written, typed,
 * versioned rule registry" and §8). The registry is data: the same object is
 * evaluated by the engine, rendered on the "how we ground answers" page, and
 * checked by tests. Nothing here is prompt text for a model.
 *
 * Detection is expressed as regular-expression sources (flags `iu` are
 * added at compile time) so the registry stays serialisable; the engine
 * compiles them once. Named groups in a pattern become the hit's `captures`
 * and can be spliced into the review prompt.
 */

export const RULE_FAMILY_IDS = ["money", "time", "duty", "exit", "data-ip"] as const;
export const ruleFamilyIdSchema = z.enum(RULE_FAMILY_IDS);
export type RuleFamilyId = z.infer<typeof ruleFamilyIdSchema>;

export const stageIdSchema = z.enum(STAGE_IDS);
export const documentTypeIdSchema = z.enum(DOCUMENT_TYPES);

/**
 * How much a rule matters at a stage. `primary` rules lead the review for
 * that stage; `secondary` ones are shown after them; a stage that is absent
 * means the rule still fires but is background information there.
 */
export const RELEVANCE_LEVELS = ["primary", "secondary"] as const;
export const relevanceSchema = z.enum(RELEVANCE_LEVELS);
export type Relevance = z.infer<typeof relevanceSchema>;

const patternSchema = z.string().min(1);

export const detectionSchema = z.object({
  /** At least one of these must match the chunk. */
  any: z.array(patternSchema).min(1),
  /** Every one of these must also match (narrows `any`). */
  all: z.array(patternSchema).optional(),
  /** None of these may match; used to rule out look-alikes. */
  none: z.array(patternSchema).optional(),
});
export type Detection = z.infer<typeof detectionSchema>;

/** `a.b.c` style ids: family, then a short kebab-case name. */
const ruleIdPattern = /^[a-z][a-z-]*\.[a-z][a-z0-9-]*$/;

export const clauseRuleSchema = z.object({
  id: z.string().regex(ruleIdPattern),
  family: ruleFamilyIdSchema,
  /** Fine-grained machine key carried on claims as `category` (e.g. "notice"). */
  category: z.string().regex(/^[a-z][a-z-]*$/),
  /** Short reader-facing name of what the rule looks for. */
  title: z.string().min(1),
  /** One plain sentence on why a reader should care. */
  whyItMatters: z.string().min(1),
  detection: detectionSchema,
  /** Stage → relevance. Stages not listed are background for this rule. */
  stages: z.record(stageIdSchema, relevanceSchema),
  /** When set, the rule is skipped for documents known to be of another type. */
  documentTypes: z.array(documentTypeIdSchema).min(1).optional(),
  /**
   * Plain-language prompt for the reader, as a template. `{clause}` is always
   * available; other `{name|fallback}` placeholders are filled from the
   * pattern's named captures, or the fallback when the capture is absent.
   */
  reviewPrompt: z.string().min(1),
});
export type ClauseRule = z.infer<typeof clauseRuleSchema>;

export const ruleFamilySchema = z.object({
  id: ruleFamilyIdSchema,
  label: z.string().min(1),
  /** What the family covers, in the reader's words. */
  description: z.string().min(1),
});
export type RuleFamily = z.infer<typeof ruleFamilySchema>;

const NAMED_GROUP = /\(\?<([a-zA-Z][a-zA-Z0-9_]*)>/g;

/** Reader-facing registry text must pass the Responsible Language check. */
function checkLanguage(text: string, path: (string | number)[], ctx: z.RefinementCtx): void {
  for (const violation of findLanguageViolations(text)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: describeLanguageViolation(violation) });
  }
}

/** Names of the named groups across a rule's patterns: what its prompt may refer to. */
export function ruleCaptureNames(rule: Pick<ClauseRule, "detection">): Set<string> {
  const names = new Set<string>();
  const sources = [...rule.detection.any, ...(rule.detection.all ?? []), ...(rule.detection.none ?? [])];
  for (const source of sources) {
    for (const match of source.matchAll(NAMED_GROUP)) names.add(match[1]!);
  }
  return names;
}

/**
 * Invariants the engine relies on beyond the field shapes: one entry per
 * family, unique rule ids prefixed with their family, prompts that only
 * refer to `{clause}` or to a capture some pattern actually produces (with a
 * fallback, since a capture may be absent on a given match), and reader-facing
 * text that stays in the review register (PRD §8, FR-06: a prompt asks a
 * neutral question, never gives a verdict). The language check runs here,
 * where the templates are admitted, so a registry with a conclusory prompt
 * fails to parse instead of reaching a screen.
 */
function checkRegistryInvariants(
  registry: { families: RuleFamily[]; rules: ClauseRule[] },
  ctx: z.RefinementCtx,
): void {
  const familyIds = registry.families.map((family) => family.id);
  if (new Set(familyIds).size !== familyIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["families"], message: "each family must appear once" });
  }
  registry.families.forEach((family, index) => {
    checkLanguage(family.label, ["families", index, "label"], ctx);
    checkLanguage(family.description, ["families", index, "description"], ctx);
  });
  const seen = new Set<string>();
  registry.rules.forEach((rule, index) => {
    checkLanguage(rule.title, ["rules", index, "title"], ctx);
    checkLanguage(rule.whyItMatters, ["rules", index, "whyItMatters"], ctx);
    // The template's own words: placeholders rendered to their fallbacks, {clause} to a neutral label.
    const rendered = renderTemplate(rule.reviewPrompt, { clause: "clause 1" });
    checkLanguage(rendered, ["rules", index, "reviewPrompt"], ctx);
    // ...and they must put something to the reader, not just describe the clause.
    const offRegister = reviewRegisterIssue(rendered);
    if (offRegister !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["rules", index, "reviewPrompt"], message: offRegister });
    }
    if (seen.has(rule.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rules", index, "id"],
        message: `duplicate rule id "${rule.id}"`,
      });
    }
    seen.add(rule.id);
    if (!rule.id.startsWith(`${rule.family}.`)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rules", index, "id"],
        message: `rule id "${rule.id}" must start with its family "${rule.family}."`,
      });
    }
    const captures = ruleCaptureNames(rule);
    for (const name of templatePlaceholders(rule.reviewPrompt)) {
      if (name === "clause") continue;
      if (!captures.has(name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rules", index, "reviewPrompt"],
          message: `{${name}} is not captured by any pattern of "${rule.id}"`,
        });
      } else if (!new RegExp(`\\{${name}\\|[^}]*\\}`).test(rule.reviewPrompt)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rules", index, "reviewPrompt"],
          message: `{${name}} needs a fallback in "${rule.id}"`,
        });
      }
    }
  });
}

export const ruleRegistrySchema = z
  .object({
    /** Bumped whenever a rule's detection or wording changes; recorded with every hit. */
    version: z.string().regex(/^\d{4}-\d{2}-\d{2}(\.\d+)?$/),
    /** Language of the reader-facing strings (titles, prompts). */
    language: z.literal("en"),
    families: z.array(ruleFamilySchema).length(RULE_FAMILY_IDS.length),
    rules: z.array(clauseRuleSchema).min(1),
  })
  .superRefine(checkRegistryInvariants);
export type RuleRegistry = z.infer<typeof ruleRegistrySchema>;
