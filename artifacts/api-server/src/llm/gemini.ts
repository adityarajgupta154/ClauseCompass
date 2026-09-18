import { z } from "zod";
import { LlmError, type LlmProvider, type LlmRequest, type LlmResponse, type StopReason } from "./provider";
import { DEFAULT_TIMEOUT_MS, postJson } from "./transport";

export { DEFAULT_TIMEOUT_MS } from "./transport";

/**
 * Google Gemini API (generateContent) over fetch: one endpoint, one forced
 * function call. The output schema goes in as the function's parameters and
 * `functionCallingConfig.mode: "ANY"` restricted to that one name leaves the
 * model no way to answer except by producing that object, which is the
 * "strict JSON schema / structured-output mode" of PRD section 7.3(b), the
 * same shape the Anthropic adapter uses. The same code talks to
 * generativelanguage.googleapis.com with the user's own key and to a
 * Gemini-compatible gateway at another base URL.
 *
 * Two things are deliberate:
 * - `additionalProperties` is dropped from the schema on the way out. The
 *   Gemini schema object has no such field and the direct API refuses unknown
 *   fields; the pipeline's own validator still rejects a claim with extra
 *   fields, so nothing is lost.
 * - Thinking is switched off for the 2.5 Flash family (thinkingBudget 0),
 *   because thinking tokens count against maxOutputTokens and the pipeline
 *   sizes that budget for a few short claims. Other models are left at their
 *   defaults: 2.5 Pro cannot go to zero, and the 3.x family takes a level
 *   rather than a budget.
 *
 * Temperature and other sampling knobs are left at their defaults on
 * purpose, as in the Anthropic adapter.
 */

export interface GeminiOptions {
  apiKey: string;
  /** Up to and including the API version, e.g. https://generativelanguage.googleapis.com/v1beta */
  baseUrl: string;
  /** Per-call wall clock; the pipeline makes at most two calls per request. */
  timeoutMs?: number;
  /** Injected in tests. */
  fetch?: typeof fetch;
}

export const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta";

/** Models whose thinking can be turned off outright. */
const THINKING_OFF = /^gemini-2\.5-flash/i;

const functionCallPart = z.object({ functionCall: z.object({ name: z.string(), args: z.unknown() }) });
const textPart = z.object({ text: z.string() });
const otherPart = z.object({}).passthrough();

const generateContentResponse = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({ parts: z.array(z.union([functionCallPart, textPart, otherPart])).optional() }).optional(),
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).passthrough().optional(),
  usageMetadata: z
    .object({
      promptTokenCount: z.number().optional(),
      candidatesTokenCount: z.number().optional(),
      thoughtsTokenCount: z.number().optional(),
    })
    .passthrough()
    .optional(),
});

const errorResponse = z.object({ error: z.object({ status: z.string().optional() }).passthrough() }).passthrough();

function errorKind(status: number): LlmError["kind"] {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate-limited";
  if (status === 503) return "overloaded";
  if (status >= 500) return "upstream";
  return "bad-request";
}

function stopReason(raw: string | undefined): StopReason {
  if (raw === "MAX_TOKENS") return "truncated";
  if (raw === "STOP") return "complete";
  return "other";
}

/** The schema without `additionalProperties`, at every level; everything else Gemini's schema object carries as is. */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (schema === null || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === "additionalProperties" || key === "$schema") continue;
    out[key] = toGeminiSchema(value);
  }
  return out;
}

export function createGeminiProvider(options: GeminiOptions): LlmProvider {
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    name: "gemini",

    async complete(request: LlmRequest, signal?: AbortSignal): Promise<LlmResponse> {
      const body = {
        systemInstruction: { parts: [{ text: request.system }] },
        contents: [{ role: "user", parts: [{ text: request.user }] }],
        tools: [
          {
            functionDeclarations: [
              {
                name: request.output.name,
                description: request.output.description,
                parameters: toGeminiSchema(request.output.schema),
              },
            ],
          },
        ],
        toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [request.output.name] } },
        generationConfig: {
          maxOutputTokens: request.maxTokens,
          ...(THINKING_OFF.test(request.model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      };

      const { status, json } = await postJson({
        url: options.baseUrl,
        path: `/models/${encodeURIComponent(request.model)}:generateContent`,
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": options.apiKey,
        },
        body,
        timeoutMs,
        signal,
        fetch: doFetch,
        provider: "Gemini",
        errorKind,
        errorType: (value) => {
          const parsed = errorResponse.safeParse(value);
          return parsed.success ? parsed.data.error.status : undefined;
        },
      });

      const parsed = generateContentResponse.safeParse(json);
      if (!parsed.success) {
        throw new LlmError("malformed-response", "Gemini API returned a response of an unexpected shape", status);
      }

      const { candidates, promptFeedback, usageMetadata } = parsed.data;
      // A blocked prompt is final: the same excerpts would be blocked again, so it is reported as a failed call rather than retried.
      if (promptFeedback?.blockReason !== undefined) {
        throw new LlmError("bad-request", `Gemini API blocked the prompt (${promptFeedback.blockReason})`, status);
      }
      const candidate = candidates?.[0];
      const parts = candidate?.content?.parts ?? [];
      const call = parts.find(
        (part): part is z.infer<typeof functionCallPart> =>
          "functionCall" in part && (part as z.infer<typeof functionCallPart>).functionCall.name === request.output.name,
      );
      const output = call
        ? call.functionCall.args
        : parts
            .filter((part): part is z.infer<typeof textPart> => "text" in part && typeof part.text === "string")
            .map((part) => part.text)
            .join("");

      // No candidate without a block reason: nothing usable came back; the validator sees empty text and refuses.
      const stop: StopReason = candidate ? stopReason(candidate.finishReason) : "other";

      return {
        output,
        stop,
        usage:
          usageMetadata?.promptTokenCount !== undefined && usageMetadata.candidatesTokenCount !== undefined
            ? {
                inputTokens: usageMetadata.promptTokenCount,
                outputTokens: usageMetadata.candidatesTokenCount + (usageMetadata.thoughtsTokenCount ?? 0),
              }
            : null,
      };
    },
  };
}
