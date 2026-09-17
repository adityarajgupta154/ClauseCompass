/**
 * The seam between the claims pipeline and a model API. One method, one
 * structured result: the pipeline hands over a system policy, a user message
 * and the JSON Schema of the single object it wants back, and gets the
 * model's attempt at that object. Nothing model-specific leaks past this
 * file; the pipeline never sees a raw API payload, and neither does the
 * client.
 */

export interface LlmRequest {
  model: string;
  system: string;
  user: string;
  /** The one structured result the model must produce, described as a JSON Schema. */
  output: { name: string; description: string; schema: Record<string, unknown> };
  /** Hard cap on generated tokens; the pipeline sizes it from how many short claims it asked for. */
  maxTokens: number;
}

/** Why generation stopped: complete, cut off by `maxTokens`, or something else (a refusal, a filter). */
export type StopReason = "complete" | "truncated" | "other";

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmResponse {
  /**
   * The structured result: the parsed JSON value when the API produced one,
   * otherwise whatever text came back (which the validator then rejects).
   */
  output: unknown;
  stop: StopReason;
  usage: LlmUsage | null;
}

export interface LlmProvider {
  readonly name: string;
  complete(request: LlmRequest, signal?: AbortSignal): Promise<LlmResponse>;
}

export type LlmErrorKind =
  "auth" | "rate-limited" | "overloaded" | "bad-request" | "upstream" | "network" | "timeout" | "malformed-response";

/**
 * A failed call, described without the response body: bodies can carry the
 * prompt back (and with it document text), so only the status and the API's
 * own error type are kept.
 */
export class LlmError extends Error {
  override readonly name = "LlmError";

  constructor(
    readonly kind: LlmErrorKind,
    message: string,
    readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}
