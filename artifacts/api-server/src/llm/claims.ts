import {
  MODEL_OUTPUT_LIMITS,
  modelOutputJsonSchema,
  validateModelOutput,
  type GroundedClaim,
  type RegisterCheck,
  type RejectedClaim,
  type SourceChunk,
  type ValidationResult,
} from "@workspace/grounding";
import type { Logger } from "pino";
import { OUTPUT_TOOL, PROMPT_INSTRUCTIONS, SYSTEM_PROMPT, buildUserMessage } from "./prompt";
import { LlmError, type LlmProvider, type LlmResponse, type LlmUsage } from "./provider";

/**
 * The one place the product talks to a model (PRD section 7.2): excerpts in,
 * validated GroundedClaims out. The model's reply is checked by the grounding
 * validator before anything is done with it; if the reply is unusable or a
 * claim fails its evidence check, the model is asked once more with the
 * findings, and whatever still fails after that is withheld. Nothing about
 * the prompt or the raw reply is part of the result; callers get claims,
 * counts and a reason.
 */

export interface ClaimRequest {
  /** What to produce from the excerpts, written by the pipeline, never by the reader. */
  task: string;
  /** The reader's typed question when the task is a question; sent as quoted data. */
  question?: string;
  /** The retrieved excerpts, with the ids the citations must use. */
  chunks: readonly SourceChunk[];
  /** Allowed category keys, usually from the rule registry. */
  categories: readonly string[];
  /** Cap for this call, 1 to MODEL_OUTPUT_LIMITS.maxClaims; a question wants 1–3, a clause map more. */
  maxClaims?: number;
  /** Overrides the configured model, for the single stronger-model escalation of PRD section 7.3(b). */
  model?: string;
  /** A register the claim text must also meet (the review view requires a question or a check); its message drives the retry. */
  register?: RegisterCheck;
}

export interface ClaimUsage extends LlmUsage {
  calls: number;
}

export type ClaimFailure = "invalid-output" | "provider-error";

export type ClaimResult =
  | {
      ok: true;
      claims: GroundedClaim[];
      /** Claims the model returned that failed their evidence check in the final attempt. */
      withheld: number;
      attempts: 1 | 2;
      usage: ClaimUsage;
    }
  | { ok: false; reason: ClaimFailure; attempts: 1 | 2; usage: ClaimUsage; error?: LlmError };

export interface GenerateOptions {
  model: string;
  /** Request logger; counts and reasons are logged, never text. */
  log?: Pick<Logger, "info" | "warn">;
  signal?: AbortSignal;
}

/**
 * Output budget: each claim is at most ~400 characters of text plus a ~300
 * character quote and the JSON around them, well under 240 tokens; the base
 * covers the object wrapper. A card-sized answer of three claims gets under
 * 900 tokens, a full map of eight about 2,000.
 */
export const TOKENS_PER_CLAIM = 240;
export const TOKENS_BASE = 128;

export function outputTokenBudget(maxClaims: number): number {
  return TOKENS_BASE + TOKENS_PER_CLAIM * maxClaims;
}

const noUsage = (): ClaimUsage => ({ inputTokens: 0, outputTokens: 0, calls: 0 });

function addUsage(total: ClaimUsage, response: LlmResponse): void {
  if (response.usage) {
    total.inputTokens += response.usage.inputTokens;
    total.outputTokens += response.usage.outputTokens;
  }
}

interface Attempt {
  response: LlmResponse;
  validation: ValidationResult;
}

/** An attempt the pipeline can return as-is: the model finished, the reply parsed, no claim failed its evidence check. */
function isClean(attempt: Attempt): boolean {
  return attempt.response.stop === "complete" && attempt.validation.ok && attempt.validation.rejected.length === 0;
}

/** What the model is told on the retry: the validator's findings, plus the stop reason when it did not finish. */
function feedbackFor({ response, validation }: Attempt): string[] {
  const items: string[] = [];
  if (response.stop === "truncated") {
    items.push("The response was cut off at the output limit; return fewer and shorter claims.");
  } else if (response.stop === "other") {
    items.push("The response did not finish; respond only through the record_claims tool.");
  }
  if (!validation.ok) items.push(...validation.issues);
  else items.push(...validation.rejected.map((claim) => claim.detail));
  return items;
}

const reasons = (rejected: readonly RejectedClaim[]) => rejected.map((claim) => claim.reason);

export async function generateClaims(
  request: ClaimRequest,
  provider: LlmProvider,
  options: GenerateOptions,
): Promise<ClaimResult> {
  const maxClaims = request.maxClaims ?? MODEL_OUTPUT_LIMITS.maxClaims;
  const outputOptions = {
    categories: request.categories,
    maxClaims,
    register: request.register,
    // A claim reciting the policy or the message's own lines is withheld; the task line and the question are not instructions to guard.
    instructions: PROMPT_INSTRUCTIONS,
  };
  const schema = modelOutputJsonSchema(outputOptions);
  const model = request.model ?? options.model;
  const usage = noUsage();
  const started = performance.now();
  const log = options.log;

  const attempt = async (feedback?: string[]): Promise<Attempt> => {
    usage.calls += 1;
    const response = await provider.complete(
      {
        model,
        system: SYSTEM_PROMPT,
        user: buildUserMessage({ ...request, maxClaims, feedback }),
        output: { ...OUTPUT_TOOL, schema },
        maxTokens: outputTokenBudget(maxClaims),
      },
      options.signal,
    );
    addUsage(usage, response);
    const validation = validateModelOutput(response.output, request.chunks, outputOptions);
    return { response, validation };
  };

  const finish = (result: ClaimResult): ClaimResult => {
    const summary = {
      provider: provider.name,
      model,
      excerpts: request.chunks.length,
      attempts: result.attempts,
      usage,
      ms: Math.round(performance.now() - started),
    };
    if (result.ok)
      log?.info({ ...summary, claims: result.claims.length, withheld: result.withheld }, "claims generated");
    else log?.warn({ ...summary, reason: result.reason, error: result.error?.kind }, "claims not generated");
    return result;
  };

  /** Only a reported provider failure becomes a result; anything else (a bug, the caller's abort) propagates. */
  const providerFailure = (err: unknown, attempts: 1 | 2): ClaimResult => {
    if (!(err instanceof LlmError)) throw err;
    return finish({ ok: false, reason: "provider-error", attempts, usage, error: err });
  };

  const verified = (validation: ValidationResult, attempts: 1 | 2): ClaimResult =>
    validation.ok
      ? finish({ ok: true, claims: validation.claims, withheld: validation.rejected.length, attempts, usage })
      : finish({ ok: false, reason: "invalid-output", attempts, usage });

  /**
   * A parsed reply whose stop reason is not a refusal or filter. A list cut
   * short by the output limit is incomplete, not wrong: every claim in it
   * passed the evidence check on its own.
   */
  const acceptable = (candidate: Attempt): boolean => candidate.validation.ok && candidate.response.stop !== "other";

  let first: Attempt;
  try {
    first = await attempt();
  } catch (err) {
    return providerFailure(err, 1);
  }
  if (isClean(first)) return verified(first.validation, 1);

  log?.warn(
    {
      failure: first.validation.ok ? undefined : first.validation.failure,
      rejected: first.validation.ok ? reasons(first.validation.rejected) : undefined,
      stop: first.response.stop,
    },
    "model output rejected by the validator; retrying once",
  );

  let second: Attempt;
  try {
    second = await attempt(feedbackFor(first));
  } catch (err) {
    // A provider failure is reported as one even on the retry; the caller decides what to tell the reader.
    return providerFailure(err, 2);
  }

  if (acceptable(second)) return verified(second.validation, 2);
  if (acceptable(first)) return verified(first.validation, 2);
  return finish({ ok: false, reason: "invalid-output", attempts: 2, usage });
}
