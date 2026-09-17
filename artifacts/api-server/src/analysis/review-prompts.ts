import {
  MODEL_OUTPUT_LIMITS,
  describeLanguageViolation,
  findLanguageViolations,
  reviewRegisterIssue,
  type GroundedClaim,
  type SourceChunk,
} from "@workspace/grounding";
import {
  RULE_REGISTRY,
  STAGE_PLANS,
  describeClause,
  evaluateRules,
  rulesForStage,
  type ClauseRule,
  type DocumentTypeId,
  type HitRelevance,
  type RuleFamilyId,
  type RuleHit,
  type StageId,
} from "@workspace/rules";
import type { Logger } from "pino";
import { generateClaims, type LlmProvider } from "../llm";
import { excerptOf } from "./document-map";
import { spanOf, verbatimClaim } from "./verbatim";

/**
 * Review Prompts (PRD section 5 step 5, FR-06): for every clause rule that
 * fired, one plain-language prompt in the review register - "check this",
 * "confirm this", "ask about this" - that names the wording it rests on.
 *
 * The deterministic layer decides what there is to prompt about: the rule
 * registry selects the clauses, so a prompt exists only for a rule that
 * actually matched, and the exact match is shown with it. The model's part
 * is phrasing: for the rules that lead or support the reader's stage it is
 * shown up to two of the paragraphs each rule fired on and asked for one
 * prompt per rule; the validator keeps what it can verify against those
 * paragraphs and rejects anything conclusory. A rule with no verified
 * phrasing - the model was down, nothing survived, or the rule is background
 * at this stage and was not sent - falls back to the registry's own template
 * for that rule, rendered for the clause, and says so. Every sentence that
 * leaves here, model or template, has passed the Responsible Language check;
 * the document's own words are quoted, never checked.
 */

export type PromptSource = "model" | "template";
/** Why a template is shown instead of the model's phrasing. */
export type TemplateReason = "model-unavailable" | "nothing-verified" | "not-asked";

export interface ReviewPrompt {
  ruleId: string;
  family: RuleFamilyId;
  /** The rule's category key, unique per rule; also the category on its claims. */
  category: string;
  title: string;
  whyItMatters: string;
  relevance: HitRelevance;
  /** The prompt for the reader; its quote is the wording it rests on. */
  prompt: GroundedClaim;
  phrasedBy: PromptSource;
  /** Set only when the prompt is the registry template. */
  reason: TemplateReason | null;
  /** The triggering wording: the sentence around the match in every paragraph the rule fired on, document order. */
  places: GroundedClaim[];
}

export interface ReviewPromptAbsence {
  ruleId: string;
  family: RuleFamilyId;
  category: string;
  title: string;
}

export interface ReviewPrompts {
  registryVersion: string;
  stage: StageId;
  /** Primary rules first, then secondary, then background; families in the stage's order within each. */
  prompts: ReviewPrompt[];
  /** Rules that lead this stage but matched nothing, so the absence is said rather than implied. */
  notFound: ReviewPromptAbsence[];
  /**
   * Model phrasings not shown, across all calls: withheld by the validator in
   * the final attempt, or returned but not tied to the rule they were written
   * for (wrong key and ambiguous excerpt, or a second claim for one rule).
   */
  withheld: number;
}

export interface BuildReviewPromptsOptions {
  stage: StageId;
  documentType?: DocumentTypeId;
  provider: LlmProvider;
  model: string;
  log?: Pick<Logger, "info" | "warn">;
  signal?: AbortSignal;
  /** Rule hits over the same chunks at the same stage, when the caller already has them. */
  hits?: readonly RuleHit<SourceChunk>[];
}

/** Paragraphs per rule the model is shown: the first places it fired on, in document order. */
export const PLACES_SENT_PER_RULE = 2;
/** One call per family batch; a batch has at most this many rules, one claim each. */
export const MAX_RULES_PER_CALL = MODEL_OUTPUT_LIMITS.maxClaims;
/** Paragraphs, and characters, one call may carry. */
export const MAX_CALL_CHUNKS = 8;
export const MAX_CALL_CHARS = 10_000;

/** Shown if a registry template ever fails the language check at build time; itself checked by tests. */
export const GENERIC_PROMPT = (clause: string) =>
  `Read ${clause} and check what it asks of you, by when, and what happens if it is not met.`;

const RELEVANCE_RANK: Record<HitRelevance, number> = { primary: 0, secondary: 1, background: 2 };

/** One rule with everything it matched, hits in document order. */
interface FiredRule {
  rule: ClauseRule;
  relevance: HitRelevance;
  hits: RuleHit<SourceChunk>[];
}

function groupByRule(hits: readonly RuleHit<SourceChunk>[]): FiredRule[] {
  const byId = new Map(RULE_REGISTRY.rules.map((rule) => [rule.id, rule]));
  const fired = new Map<string, FiredRule>();
  for (const hit of hits) {
    const rule = byId.get(hit.ruleId);
    if (!rule) throw new Error(`hit for unknown rule "${hit.ruleId}"`);
    const entry = fired.get(hit.ruleId) ?? { rule, relevance: hit.relevance ?? "background", hits: [] };
    entry.hits.push(hit);
    fired.set(hit.ruleId, entry);
  }
  for (const entry of fired.values()) entry.hits.sort((a, b) => a.chunkIndex - b.chunkIndex);
  return [...fired.values()];
}

function matchSpan(hit: RuleHit<SourceChunk>) {
  // `matched` is a substring of the chunk text by construction (the engine's regex ran on it).
  const span = spanOf(hit.chunk.text, hit.matched);
  if (!span) throw new Error(`match for "${hit.ruleId}" not found in chunk ${hit.chunk.id}`);
  return span;
}

function placeOf(hit: RuleHit<SourceChunk>): GroundedClaim {
  return verbatimClaim(hit.chunk, matchSpan(hit), hit.category, { quote: "sentence" });
}

/**
 * The registry's prompt for the first place the rule fired on, as a claim
 * whose quote is that sentence. Checked once more here - the registry
 * cannot parse with a conclusory template, so a failure means a template
 * rendered with a capture went wrong - and replaced by the generic prompt
 * with a warning rather than shown.
 */
function templatePrompt(entry: FiredRule, log: BuildReviewPromptsOptions["log"]): GroundedClaim {
  const first = entry.hits[0]!;
  const place = placeOf(first);
  let text = first.reviewPrompt;
  const violations = findLanguageViolations(text);
  if (violations.length > 0) {
    log?.warn(
      { ruleId: entry.rule.id, violations: violations.map(describeLanguageViolation) },
      "review prompt template failed the language check; generic prompt shown",
    );
    text = GENERIC_PROMPT(describeClause(first.clause));
  }
  return { ...place, text };
}

/** A model call's worth of rules and the excerpts selected for them. */
interface Batch {
  family: RuleFamilyId;
  rules: FiredRule[];
  /** Excerpts sent, in document order. */
  chunks: SourceChunk[];
  /** Which rules each sent chunk was selected for. */
  rulesByChunk: Map<string, Set<string>>;
  /** Rules that got no excerpt in (the caps were reached first). */
  unsent: Set<string>;
}

/**
 * Round-robin over the batch's rules - every rule's first place, then every
 * rule's second - until the chunk or character cap is reached, so a rule
 * with many places cannot crowd out one with a single place. A chunk that
 * several rules fired on is sent once and credited to each.
 */
export function selectExcerpts(family: RuleFamilyId, rules: FiredRule[]): Batch {
  const picked = new Map<string, { chunk: SourceChunk; chunkIndex: number }>();
  const rulesByChunk = new Map<string, Set<string>>();
  let chars = 0;
  const credit = (chunkId: string, ruleId: string) => {
    const set = rulesByChunk.get(chunkId) ?? new Set<string>();
    set.add(ruleId);
    rulesByChunk.set(chunkId, set);
  };
  for (let round = 0; round < PLACES_SENT_PER_RULE; round += 1) {
    for (const entry of rules) {
      const hit = entry.hits[round];
      if (!hit) continue;
      const id = hit.chunk.id;
      const already = picked.get(id);
      if (already) {
        // A long paragraph is sent as a window around the first rule's match; another
        // rule is credited with it only if its own wording is inside that window.
        if (spanOf(already.chunk.text, hit.matched)) credit(id, entry.rule.id);
        continue;
      }
      if (picked.size >= MAX_CALL_CHUNKS) continue;
      const excerpt = excerptOf({ chunk: hit.chunk, match: matchSpan(hit), category: hit.category });
      if (picked.size > 0 && chars + excerpt.text.length > MAX_CALL_CHARS) continue;
      picked.set(id, { chunk: excerpt, chunkIndex: hit.chunkIndex });
      chars += excerpt.text.length;
      credit(id, entry.rule.id);
    }
  }
  const sentRules = new Set([...rulesByChunk.values()].flatMap((set) => [...set]));
  return {
    family,
    rules,
    chunks: [...picked.values()].sort((a, b) => a.chunkIndex - b.chunkIndex).map((item) => item.chunk),
    rulesByChunk,
    unsent: new Set(rules.filter((entry) => !sentRules.has(entry.rule.id)).map((entry) => entry.rule.id)),
  };
}

/**
 * The task line: which category each excerpt was selected for, by id -
 * never document text. The "key (Title): p1, p2" form is what the mock
 * provider reads its assignments from; keep it if the wording changes.
 */
export function taskFor(batch: Batch): string {
  const selections = batch.rules
    .filter((entry) => !batch.unsent.has(entry.rule.id))
    .map((entry) => {
      const ids = batch.chunks
        .filter((chunk) => batch.rulesByChunk.get(chunk.id)?.has(entry.rule.id))
        .map((chunk) => chunk.id);
      return `${entry.rule.category} (${entry.rule.title}): ${ids.join(", ")}`;
    });
  return [
    "Write one review prompt per category key: one or two short sentences that say what the excerpt sets out on that point and put a neutral check or question to the reader about it - what to confirm, what to ask, what to look for - naming the wording it rests on.",
    "Categories, each with the ids of the excerpts selected for it:",
    selections.join("; ") + ".",
    "Cite only the excerpts listed for the category. Return at most one claim per category; leave a category out if its excerpts do not support a prompt.",
  ].join(" ");
}

interface Placed {
  claim: GroundedClaim;
  /** Whether the claim's own category named the rule, or its supporting excerpt was the only way to place it. */
  by: "category" | "excerpt";
}

interface Placement {
  placed: Map<string, Placed>;
  /** Verified claims not shown: unplaceable, or a second claim for a rule that already has one. */
  dropped: number;
}

/**
 * Places each verified claim with a rule of the batch. The category key
 * names the rule, and the claim's quote must come from an excerpt selected
 * for that rule - the validator puts the quote-bearing citation first - so
 * a prompt cannot rest on a clause the rule never matched. A claim whose
 * category names no rule of the batch, or one its quote does not come from,
 * is placed by that excerpt when it was selected for exactly one rule (the
 * model slipped on the key, not on the clause) and takes that rule's key.
 * Anything else is dropped and counted. One claim per rule: the first
 * best-supported; the rest are counted too.
 */
export function placeClaims(batch: Batch, claims: readonly GroundedClaim[]): Placement {
  const placed = new Map<string, Placed>();
  const byCategory = new Map(batch.rules.map((entry) => [entry.rule.category, entry.rule.id]));
  const categoryOf = new Map(batch.rules.map((entry) => [entry.rule.id, entry.rule.category]));
  let dropped = 0;
  for (const claim of claims) {
    const support = claim.source_chunk_ids[0]!;
    const creditedRules = batch.rulesByChunk.get(support) ?? new Set<string>();
    let ruleId = byCategory.get(claim.category);
    let by: Placed["by"] = "category";
    let placedClaim = claim;
    if (ruleId === undefined || !creditedRules.has(ruleId)) {
      if (creditedRules.size !== 1) {
        dropped += 1;
        continue;
      }
      ruleId = [...creditedRules][0]!;
      by = "excerpt";
      placedClaim = { ...claim, category: categoryOf.get(ruleId)! };
    }
    const current = placed.get(ruleId);
    if (!current) {
      placed.set(ruleId, { claim: placedClaim, by });
    } else if (placedClaim.confidence > current.claim.confidence) {
      placed.set(ruleId, { claim: placedClaim, by });
      dropped += 1;
    } else {
      dropped += 1;
    }
  }
  return { placed, dropped };
}

interface BatchOutcome {
  placed: Map<string, Placed>;
  reason: Exclude<TemplateReason, "not-asked">;
  withheld: number;
}

async function runBatch(batch: Batch, options: BuildReviewPromptsOptions): Promise<BatchOutcome> {
  const asked = batch.rules.filter((entry) => !batch.unsent.has(entry.rule.id));
  if (asked.length === 0 || batch.chunks.length === 0) {
    return { placed: new Map(), reason: "nothing-verified", withheld: 0 };
  }
  const result = await generateClaims(
    {
      task: taskFor(batch),
      chunks: batch.chunks,
      categories: asked.map((entry) => entry.rule.category),
      maxClaims: asked.length,
      // Beyond the shared table: a prompt has to ask or check something, or the template is better.
      register: reviewRegisterIssue,
    },
    options.provider,
    { model: options.model, log: options.log, signal: options.signal },
  );
  if (!result.ok) {
    return { placed: new Map(), reason: result.reason === "provider-error" ? "model-unavailable" : "nothing-verified", withheld: 0 };
  }
  const { placed, dropped } = placeClaims(batch, result.claims);
  options.log?.info(
    {
      family: batch.family,
      rules: asked.length,
      excerpts: batch.chunks.length,
      claims: result.claims.length,
      placed: placed.size,
      byExcerpt: [...placed.values()].filter((item) => item.by === "excerpt").length,
      withheld: result.withheld,
      dropped,
    },
    "review prompts phrased",
  );
  return { placed, reason: "nothing-verified", withheld: result.withheld + dropped };
}

function appliesTo(rule: ClauseRule, documentType: DocumentTypeId | undefined): boolean {
  if (documentType === undefined || rule.documentTypes === undefined) return true;
  return rule.documentTypes.includes(documentType);
}

/**
 * The rules that lead the stage and apply to the document type but matched
 * nothing: shown as such, in the stage's family order then registry order.
 */
export function absentPrimaryRules(
  stage: StageId,
  documentType: DocumentTypeId | undefined,
  firedIds: ReadonlySet<string>,
): ReviewPromptAbsence[] {
  const familyRank = new Map(STAGE_PLANS[stage].families.map((family, index) => [family, index]));
  const registryIndex = new Map(RULE_REGISTRY.rules.map((rule, index) => [rule.id, index]));
  return rulesForStage(stage)
    .filter(({ rule, relevance }) => relevance === "primary" && appliesTo(rule, documentType) && !firedIds.has(rule.id))
    .map(({ rule }) => rule)
    .sort(
      (a, b) =>
        (familyRank.get(a.family) ?? 99) - (familyRank.get(b.family) ?? 99) ||
        registryIndex.get(a.id)! - registryIndex.get(b.id)!,
    )
    .map((rule) => ({ ruleId: rule.id, family: rule.family, category: rule.category, title: rule.title }));
}

/**
 * Builds the prompts for one document. Model calls run one per family,
 * concurrently, and cover the rules that lead or support the stage;
 * background rules are shown with their templates without a call. A
 * provider failure on one family degrades that family alone to templates.
 * Anything the provider does not report as its own failure propagates.
 */
export async function buildReviewPrompts(
  chunks: readonly SourceChunk[],
  options: BuildReviewPromptsOptions,
): Promise<ReviewPrompts> {
  const hits = options.hits ?? evaluateRules(chunks, { stage: options.stage, documentType: options.documentType });
  const fired = groupByRule(hits);
  const familyRank = new Map(STAGE_PLANS[options.stage].families.map((family, index) => [family, index]));
  const registryIndex = new Map(RULE_REGISTRY.rules.map((rule, index) => [rule.id, index]));

  // One batch per family of the rules the model phrases, split if a family ever has more rules than a call may carry.
  const batches: Batch[] = [];
  for (const family of STAGE_PLANS[options.stage].families) {
    const rules = fired
      .filter((entry) => entry.rule.family === family && entry.relevance !== "background")
      .sort(
        (a, b) =>
          RELEVANCE_RANK[a.relevance] - RELEVANCE_RANK[b.relevance] ||
          registryIndex.get(a.rule.id)! - registryIndex.get(b.rule.id)!,
      );
    for (let start = 0; start < rules.length; start += MAX_RULES_PER_CALL) {
      batches.push(selectExcerpts(family, rules.slice(start, start + MAX_RULES_PER_CALL)));
    }
  }
  const outcomes = await Promise.all(batches.map((batch) => runBatch(batch, options)));

  const phrased = new Map<string, { claim: GroundedClaim } | { reason: TemplateReason }>();
  batches.forEach((batch, index) => {
    const outcome = outcomes[index]!;
    for (const entry of batch.rules) {
      const placed = outcome.placed.get(entry.rule.id);
      if (placed) phrased.set(entry.rule.id, { claim: placed.claim });
      else phrased.set(entry.rule.id, { reason: batch.unsent.has(entry.rule.id) ? "not-asked" : outcome.reason });
    }
  });

  const prompts: ReviewPrompt[] = fired.map((entry) => {
    const outcome = phrased.get(entry.rule.id) ?? { reason: "not-asked" as const };
    const places = entry.hits.map(placeOf);
    const common = {
      ruleId: entry.rule.id,
      family: entry.rule.family,
      category: entry.rule.category,
      title: entry.rule.title,
      whyItMatters: entry.rule.whyItMatters,
      relevance: entry.relevance,
      places,
    };
    if ("claim" in outcome) {
      // The validator has already refused conclusory wording; this is the builder's own assertion of the same rule.
      const violations = findLanguageViolations(outcome.claim.text);
      if (violations.length === 0) {
        return { ...common, prompt: outcome.claim, phrasedBy: "model", reason: null };
      }
      options.log?.warn(
        { ruleId: entry.rule.id, violations: violations.map(describeLanguageViolation) },
        "model prompt failed the language check after validation; template shown",
      );
      return { ...common, prompt: templatePrompt(entry, options.log), phrasedBy: "template", reason: "nothing-verified" };
    }
    return { ...common, prompt: templatePrompt(entry, options.log), phrasedBy: "template", reason: outcome.reason };
  });

  prompts.sort(
    (a, b) =>
      RELEVANCE_RANK[a.relevance] - RELEVANCE_RANK[b.relevance] ||
      (familyRank.get(a.family) ?? 99) - (familyRank.get(b.family) ?? 99) ||
      registryIndex.get(a.ruleId)! - registryIndex.get(b.ruleId)!,
  );

  return {
    registryVersion: RULE_REGISTRY.version,
    stage: options.stage,
    prompts,
    notFound: absentPrimaryRules(options.stage, options.documentType, new Set(fired.map((entry) => entry.rule.id))),
    withheld: outcomes.reduce((sum, outcome) => sum + outcome.withheld, 0),
  };
}
