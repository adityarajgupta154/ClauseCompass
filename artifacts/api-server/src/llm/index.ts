import { getConfig, type Config } from "../lib/config";
import { createAnthropicProvider } from "./anthropic";
import { limitConcurrency } from "./concurrency";
import { createGeminiProvider } from "./gemini";
import { createMockProvider } from "./mock";
import type { LlmProvider } from "./provider";

/**
 * Server-side model access (PRD section 7.3(b)). Routes call
 * generateClaims() with the provider from getLlmProvider(); nothing else in
 * the server talks to a model, and nothing in the client can.
 */

export function createLlmProvider(llm: Config["llm"]): LlmProvider {
  if (llm.provider === "gemini") return createGeminiProvider({ apiKey: llm.apiKey, baseUrl: llm.baseUrl });
  if (llm.provider === "anthropic") return createAnthropicProvider({ apiKey: llm.apiKey, baseUrl: llm.baseUrl });
  return createMockProvider();
}

let cached: LlmProvider | undefined;

/** The process-wide provider for the configured LLM_PROVIDER, behind the process-wide cap on calls in flight (LLM_MAX_CONCURRENT). */
export function getLlmProvider(): LlmProvider {
  if (!cached) {
    const config = getConfig();
    cached = limitConcurrency(createLlmProvider(config.llm), config.llmMaxConcurrent);
  }
  return cached;
}

export {
  generateClaims,
  outputTokenBudget,
  type ClaimFailure,
  type ClaimRequest,
  type ClaimResult,
  type ClaimUsage,
} from "./claims";
export { LlmError, type LlmErrorKind, type LlmProvider, type LlmRequest, type LlmResponse } from "./provider";
