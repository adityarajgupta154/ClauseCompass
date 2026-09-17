import { type ClauseLabel, describeClause, detectClauseLabel, isHeading } from "./clause-label";
import type { DocumentTypeId, StageId } from "./contract";
import { RULE_REGISTRY } from "./registry";
import {
  type ClauseRule,
  type Detection,
  type Relevance,
  type RuleFamilyId,
  type RuleRegistry,
  ruleRegistrySchema,
} from "./schema";
import { renderTemplate } from "./template";

/**
 * The rule engine: pure functions from paragraphs to hits. No I/O, no model,
 * no clock; the same input always gives the same output, which is what lets
 * the golden tests pin the registry's behaviour on the synthetic documents.
 */

/** The least a chunk needs; extraction's richer chunk types satisfy it. */
export interface RuleChunk {
  text: string;
}

export interface EvaluateOptions {
  /** Where the reader is; orders hits and sets each hit's relevance. */
  stage?: StageId;
  /** When known, rules scoped to other document types are skipped. */
  documentType?: DocumentTypeId;
  /**
   * Defaults to the built-in registry. A custom registry is validated and
   * compiled on first use and treated as immutable afterwards: pass a new
   * object rather than mutating one already evaluated.
   */
  registry?: RuleRegistry;
}

/** A rule at a stage it does not list still fires, as background. */
export type HitRelevance = Relevance | "background";

export interface RuleHit<C extends RuleChunk = RuleChunk> {
  ruleId: string;
  family: RuleFamilyId;
  category: string;
  title: string;
  whyItMatters: string;
  /** Registry version the hit was produced with, so stored hits can be traced. */
  registryVersion: string;
  /** Position of the chunk in the input array (0-based). */
  chunkIndex: number;
  chunk: C;
  clause: ClauseLabel | null;
  /** The text that satisfied the rule's first matching `any` pattern. */
  matched: string;
  /** Named groups collected from the patterns that matched. */
  captures: Record<string, string>;
  /** Relevance at the requested stage; null when no stage was given. */
  relevance: HitRelevance | null;
  /** The rule's review prompt rendered for this clause. */
  reviewPrompt: string;
}

export interface RuleMatch {
  matched: string;
  captures: Record<string, string>;
}

export interface CompiledDetection {
  any: RegExp[];
  all: RegExp[];
  none: RegExp[];
}

interface CompiledRule extends CompiledDetection {
  rule: ClauseRule;
  order: number;
}

const FLAGS = "iu";
const compiledCache = new WeakMap<RuleRegistry, CompiledRule[]>();

export function compilePattern(source: string): RegExp {
  return new RegExp(source, FLAGS);
}

function compileRegistry(registry: RuleRegistry): CompiledRule[] {
  const cached = compiledCache.get(registry);
  if (cached) return cached;
  ruleRegistrySchema.parse(registry);
  const compiled = registry.rules.map((rule, order) => ({ rule, order, ...compileDetection(rule.detection) }));
  compiledCache.set(registry, compiled);
  return compiled;
}

function collectCaptures(into: Record<string, string>, match: RegExpExecArray): void {
  for (const [name, value] of Object.entries(match.groups ?? {})) {
    if (value !== undefined && !(name in into)) into[name] = value;
  }
}

function matchCompiled(compiled: CompiledDetection, text: string): RuleMatch | null {
  let matched: string | null = null;
  const captures: Record<string, string> = {};
  for (const pattern of compiled.any) {
    const match = pattern.exec(text);
    if (!match) continue;
    matched ??= match[0];
    collectCaptures(captures, match);
  }
  if (matched === null) return null;
  for (const pattern of compiled.all) {
    const match = pattern.exec(text);
    if (!match) return null;
    collectCaptures(captures, match);
  }
  for (const pattern of compiled.none) {
    if (pattern.test(text)) return null;
  }
  return { matched, captures };
}

export function compileDetection(detection: Detection): CompiledDetection {
  return {
    any: detection.any.map(compilePattern),
    all: (detection.all ?? []).map(compilePattern),
    none: (detection.none ?? []).map(compilePattern),
  };
}

/** Runs one `{ any, all, none }` detection against a piece of text. */
export function matchDetection(detection: Detection | CompiledDetection, text: string): RuleMatch | null {
  const compiled = isCompiled(detection) ? detection : compileDetection(detection);
  return matchCompiled(compiled, text);
}

function isCompiled(detection: Detection | CompiledDetection): detection is CompiledDetection {
  return detection.any[0] instanceof RegExp;
}

/** Tests one rule against one piece of text, ignoring stage and document type. */
export function matchRule(rule: ClauseRule, text: string): RuleMatch | null {
  return matchDetection(rule.detection, text);
}

const RELEVANCE_RANK: Record<HitRelevance, number> = {
  primary: 0,
  secondary: 1,
  background: 2,
};

function relevanceAt(rule: ClauseRule, stage: StageId | undefined): HitRelevance | null {
  if (stage === undefined) return null;
  return rule.stages[stage] ?? "background";
}

function appliesTo(rule: ClauseRule, documentType: DocumentTypeId | undefined): boolean {
  if (documentType === undefined || rule.documentTypes === undefined) return true;
  return rule.documentTypes.includes(documentType);
}

/**
 * Runs every applicable rule over every chunk. Headings are skipped. Hits are
 * ordered for reading: by relevance at the stage (primary, secondary, then
 * background) when a stage is given, then by position in the document, then
 * by the rule's place in the registry.
 */
export function evaluateRules<C extends RuleChunk>(chunks: readonly C[], options: EvaluateOptions = {}): RuleHit<C>[] {
  const registry = options.registry ?? RULE_REGISTRY;
  const compiled = compileRegistry(registry).filter((entry) => appliesTo(entry.rule, options.documentType));
  const hits: Array<RuleHit<C> & { order: number }> = [];

  chunks.forEach((chunk, chunkIndex) => {
    const text = chunk.text;
    if (text.trim() === "" || isHeading(text)) return;
    const clause = detectClauseLabel(text);
    const clauseName = describeClause(clause);
    for (const entry of compiled) {
      const match = matchCompiled(entry, text);
      if (!match) continue;
      const { rule } = entry;
      hits.push({
        ruleId: rule.id,
        family: rule.family,
        category: rule.category,
        title: rule.title,
        whyItMatters: rule.whyItMatters,
        registryVersion: registry.version,
        chunkIndex,
        chunk,
        clause,
        matched: match.matched,
        captures: match.captures,
        relevance: relevanceAt(rule, options.stage),
        reviewPrompt: capitalize(
          renderTemplate(rule.reviewPrompt, {
            ...match.captures,
            clause: clauseName,
          }),
        ),
        order: entry.order,
      });
    }
  });

  hits.sort((a, b) => {
    if (a.relevance !== null && b.relevance !== null && a.relevance !== b.relevance) {
      return RELEVANCE_RANK[a.relevance] - RELEVANCE_RANK[b.relevance];
    }
    return a.chunkIndex - b.chunkIndex || a.order - b.order;
  });

  return hits.map(({ order: _order, ...hit }) => hit);
}

function capitalize(sentence: string): string {
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

export interface FamilySummary {
  family: RuleFamilyId;
  label: string;
  hitCount: number;
  /** Distinct chunk positions the family touched, in document order. */
  chunkIndexes: number[];
  /** Distinct rules that fired, in registry order. */
  ruleIds: string[];
}

/**
 * Groups hits by family for the document map. Every family is present, even
 * with no hits; families are ordered by hit count, then registry order.
 */
export function summarizeFamilies(hits: readonly RuleHit[], registry: RuleRegistry = RULE_REGISTRY): FamilySummary[] {
  const ruleOrder = new Map(registry.rules.map((rule, index) => [rule.id, index]));
  const summaries = registry.families.map((family) => {
    const own = hits.filter((hit) => hit.family === family.id);
    const chunkIndexes = [...new Set(own.map((hit) => hit.chunkIndex))].sort((a, b) => a - b);
    const ruleIds = [...new Set(own.map((hit) => hit.ruleId))].sort(
      (a, b) => (ruleOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (ruleOrder.get(b) ?? Number.MAX_SAFE_INTEGER),
    );
    return {
      family: family.id,
      label: family.label,
      hitCount: own.length,
      chunkIndexes,
      ruleIds,
    };
  });
  return summaries
    .map((summary, index) => ({ summary, index }))
    .sort((a, b) => b.summary.hitCount - a.summary.hitCount || a.index - b.index)
    .map(({ summary }) => summary);
}

export interface StageRule {
  rule: ClauseRule;
  relevance: Relevance;
}

/** The rules that lead or support a stage, primary first, in registry order. */
export function rulesForStage(stage: StageId, registry: RuleRegistry = RULE_REGISTRY): StageRule[] {
  const listed: StageRule[] = [];
  for (const rule of registry.rules) {
    const relevance = rule.stages[stage];
    if (relevance) listed.push({ rule, relevance });
  }
  return listed.sort((a, b) => RELEVANCE_RANK[a.relevance] - RELEVANCE_RANK[b.relevance]);
}
