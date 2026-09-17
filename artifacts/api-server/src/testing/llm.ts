import type { LlmProvider, LlmRequest, LlmResponse, StopReason } from "../llm/provider";

/**
 * A provider that plays back a script: each entry is what the model
 * "returns" for one call, in order. Tests hand it deliberately broken
 * output (bad JSON text, citations that were never sent) to prove the
 * validator stops it. An Error entry is thrown instead of returned; an
 * `{ output, stop }` entry (see `truncated`) sets the stop reason.
 */

/** One canned reply: a value the "model" returns, an Error to throw, or an explicit response with its stop reason. */
export type ScriptEntry = unknown | Error | { output: unknown; stop: StopReason };

export function truncated(output: unknown): ScriptEntry {
  return { output, stop: "truncated" };
}

function isExplicit(entry: unknown): entry is { output: unknown; stop: StopReason } {
  return typeof entry === "object" && entry !== null && "output" in entry && "stop" in entry;
}

export interface ScriptedProvider extends LlmProvider {
  /** Every request received, in order, for assertions about the prompt. */
  readonly requests: LlmRequest[];
}

export function scriptedProvider(script: readonly ScriptEntry[]): ScriptedProvider {
  const remaining = [...script];
  const requests: LlmRequest[] = [];
  return {
    name: "scripted",
    requests,
    async complete(request: LlmRequest): Promise<LlmResponse> {
      requests.push(request);
      if (remaining.length === 0) throw new Error("scripted provider: more calls than script entries");
      const entry = remaining.shift();
      if (entry instanceof Error) throw entry;
      if (isExplicit(entry)) return { output: entry.output, stop: entry.stop, usage: null };
      return { output: entry, stop: "complete", usage: { inputTokens: 100, outputTokens: 50 } };
    },
  };
}
