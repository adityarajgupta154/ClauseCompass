import { Gate } from "../middlewares/extraction-gate";
import { LlmError, type LlmProvider, type LlmRequest, type LlmResponse } from "./provider";

/**
 * Caps how many model calls the process has in flight at once, whatever the
 * routes above are doing. One analysis fans out to several calls (a Document
 * Map to six, Review Prompts to one per family batch); the route gate bounds
 * how many analyses run together, and this bounds the calls they add up to,
 * so a burst of readers costs at most `maxConcurrent` open connections to the
 * model API at any moment. Calls past the cap wait their turn in arrival
 * order; a caller that gives up while waiting (an aborted request) is let
 * go without ever calling. Past `maxWaiting` the call fails at once as
 * `overloaded`, which the claims pipeline reports as a provider error, so
 * the reader still gets the verbatim fallback rather than a hang.
 */

export const DEFAULT_MAX_WAITING_CALLS = 256;

export function limitConcurrency(
  provider: LlmProvider,
  maxConcurrent: number,
  maxWaiting: number = DEFAULT_MAX_WAITING_CALLS,
): LlmProvider {
  const gate = new Gate(maxConcurrent, maxWaiting);
  return {
    name: provider.name,
    async complete(request: LlmRequest, signal?: AbortSignal): Promise<LlmResponse> {
      signal?.throwIfAborted();
      const admission = gate.acquire();
      if (!admission) {
        throw new LlmError("overloaded", `more than ${maxWaiting} model calls are already waiting in this process`);
      }
      const release = await admission;
      try {
        // A call that was aborted while it waited must not spend a slot on the wire.
        signal?.throwIfAborted();
        return await provider.complete(request, signal);
      } finally {
        release();
      }
    },
  };
}
