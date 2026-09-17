import { z } from "zod";
import { LlmError, type LlmProvider, type LlmRequest, type LlmResponse, type StopReason } from "./provider";

/**
 * Anthropic Messages API over fetch: one endpoint, one forced tool call. The
 * schema goes in as the tool's input schema and the model has no way to
 * answer except by producing that object, which is the "strict JSON schema /
 * structured-output mode" of PRD section 7.3(b) without an SDK. The same
 * code talks to api.anthropic.com with the user's own key and to the Replit
 * Anthropic AI integration, which speaks the same protocol at another base
 * URL.
 *
 * Temperature and other sampling knobs are left at their defaults on
 * purpose: some models reject them, and structured extraction does not need
 * them.
 */

export interface AnthropicOptions {
  apiKey: string;
  baseUrl: string;
  /** Per-call wall clock; the pipeline makes at most two calls per request. */
  timeoutMs?: number;
  /** Injected in tests. */
  fetch?: typeof fetch;
}

export const ANTHROPIC_VERSION = "2023-06-01";
export const DEFAULT_TIMEOUT_MS = 30_000;

const toolUseBlock = z.object({ type: z.literal("tool_use"), name: z.string(), input: z.unknown() });
const textBlock = z.object({ type: z.literal("text"), text: z.string() });
const otherBlock = z.object({ type: z.string() }).passthrough();

const messageResponse = z.object({
  content: z.array(z.union([toolUseBlock, textBlock, otherBlock])),
  stop_reason: z.string().nullable().optional(),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }).partial().optional(),
});

const errorResponse = z.object({ error: z.object({ type: z.string() }).passthrough() }).passthrough();

function errorKind(status: number): LlmError["kind"] {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate-limited";
  if (status === 529) return "overloaded";
  if (status >= 500) return "upstream";
  return "bad-request";
}

function stopReason(raw: string | null | undefined): StopReason {
  if (raw === "max_tokens") return "truncated";
  if (raw === "tool_use" || raw === "end_turn" || raw === "stop_sequence") return "complete";
  return "other";
}

export function createAnthropicProvider(options: AnthropicOptions): LlmProvider {
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const endpoint = `${options.baseUrl.replace(/\/+$/, "")}/v1/messages`;

  return {
    name: "anthropic",

    async complete(request: LlmRequest, signal?: AbortSignal): Promise<LlmResponse> {
      const body = {
        model: request.model,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: [{ role: "user", content: request.user }],
        tools: [
          {
            name: request.output.name,
            description: request.output.description,
            input_schema: request.output.schema,
          },
        ],
        tool_choice: { type: "tool", name: request.output.name, disable_parallel_tool_use: true },
      };

      const timeout = AbortSignal.timeout(timeoutMs);
      const transportError = (err: unknown): never => {
        if (timeout.aborted) {
          throw new LlmError("timeout", `Anthropic API call exceeded ${timeoutMs} ms`, undefined, { cause: err });
        }
        if (signal?.aborted) throw err;
        throw new LlmError("network", "Anthropic API could not be reached", undefined, { cause: err });
      };

      let response: Response;
      try {
        response = await doFetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": options.apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          body: JSON.stringify(body),
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
      } catch (err) {
        return transportError(err);
      }

      // The body can still fail mid-stream (abort, timeout, dropped connection); only a non-JSON body is "no JSON".
      let json: unknown;
      try {
        json = await response.json();
      } catch (err) {
        if (!(err instanceof SyntaxError)) return transportError(err);
        json = undefined;
      }

      if (!response.ok) {
        const parsed = errorResponse.safeParse(json);
        const type = parsed.success ? parsed.data.error.type : "unknown";
        throw new LlmError(
          errorKind(response.status),
          `Anthropic API responded ${response.status} (${type})`,
          response.status,
        );
      }

      const parsed = messageResponse.safeParse(json);
      if (!parsed.success) {
        throw new LlmError(
          "malformed-response",
          "Anthropic API returned a response of an unexpected shape",
          response.status,
        );
      }

      const { content, stop_reason, usage } = parsed.data;
      const tool = content.find(
        (block): block is z.infer<typeof toolUseBlock> =>
          block.type === "tool_use" && block.name === request.output.name,
      );
      const output = tool
        ? tool.input
        : content
            .filter((block): block is z.infer<typeof textBlock> => block.type === "text")
            .map((block) => block.text)
            .join("");

      return {
        output,
        stop: stopReason(stop_reason),
        usage:
          usage?.input_tokens !== undefined && usage.output_tokens !== undefined
            ? { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens }
            : null,
      };
    },
  };
}
