import { describe, expect, it } from "vitest";
import { ANTHROPIC_VERSION, createAnthropicProvider } from "./anthropic";
import { LlmError, type LlmRequest } from "./provider";

/**
 * The adapter is exercised against a stubbed fetch: what goes on the wire,
 * how a tool call comes back, and that a failure is reported by status and
 * type only, never by body.
 */

const request: LlmRequest = {
  model: "claude-haiku-4-5",
  system: "policy",
  user: "task",
  output: { name: "record_claims", description: "records", schema: { type: "object" } },
  maxTokens: 848,
};

type Handler = (input: string, init: RequestInit) => Response | Promise<Response>;

function providerWith(handler: Handler, calls: Array<{ url: string; init: RequestInit }> = []) {
  const stub = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return handler(String(input), init ?? {});
  }) as typeof fetch;
  return createAnthropicProvider({
    apiKey: "sk-test",
    baseUrl: "https://example.test/anthropic/",
    fetch: stub,
    timeoutMs: 500,
  });
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Anthropic provider", () => {
  it("posts one forced tool call with the schema, the key header and the token cap", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const provider = providerWith(
      () =>
        json(200, {
          content: [{ type: "tool_use", id: "t1", name: "record_claims", input: { claims: [] } }],
          stop_reason: "tool_use",
          usage: { input_tokens: 321, output_tokens: 12 },
        }),
      calls,
    );
    const response = await provider.complete(request);

    expect(response).toEqual({
      output: { claims: [] },
      stop: "complete",
      usage: { inputTokens: 321, outputTokens: 12 },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://example.test/anthropic/v1/messages");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-test");
    expect(headers["anthropic-version"]).toBe(ANTHROPIC_VERSION);
    const body = JSON.parse(calls[0]!.init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "claude-haiku-4-5",
      max_tokens: 848,
      system: "policy",
      messages: [{ role: "user", content: "task" }],
      tools: [{ name: "record_claims", input_schema: { type: "object" } }],
      tool_choice: { type: "tool", name: "record_claims" },
    });
    expect(body).not.toHaveProperty("temperature");
  });

  it("hands back text when the model answered without the tool, so the validator rejects it", async () => {
    const provider = providerWith(() =>
      json(200, { content: [{ type: "text", text: "I cannot do that." }], stop_reason: "end_turn" }),
    );
    const response = await provider.complete(request);
    expect(response.output).toBe("I cannot do that.");
    expect(response.usage).toBeNull();
  });

  it("reports an output-limit stop", async () => {
    const provider = providerWith(() =>
      json(200, {
        content: [{ type: "tool_use", id: "t1", name: "record_claims", input: {} }],
        stop_reason: "max_tokens",
      }),
    );
    expect((await provider.complete(request)).stop).toBe("truncated");
  });

  it("maps API errors to a kind and status, keeping the body out of the message", async () => {
    const cases: Array<[number, string, LlmError["kind"]]> = [
      [401, "authentication_error", "auth"],
      [429, "rate_limit_error", "rate-limited"],
      [529, "overloaded_error", "overloaded"],
      [500, "api_error", "upstream"],
      [400, "invalid_request_error", "bad-request"],
    ];
    for (const [status, type, kind] of cases) {
      const provider = providerWith(() =>
        json(status, { type: "error", error: { type, message: "SECRET DETAIL: prompt was 'task'" } }),
      );
      const err = await provider.complete(request).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(LlmError);
      const llmError = err as LlmError;
      expect(llmError.kind).toBe(kind);
      expect(llmError.status).toBe(status);
      expect(llmError.message).toBe(`Anthropic API responded ${status} (${type})`);
      expect(llmError.message).not.toContain("SECRET");
    }
  });

  it("treats a non-JSON error body and an unexpected success body as errors too", async () => {
    const html = providerWith(() => new Response("<html>gateway</html>", { status: 502 }));
    await expect(html.complete(request)).rejects.toMatchObject({ kind: "upstream", status: 502 });

    const odd = providerWith(() => json(200, { hello: "world" }));
    await expect(odd.complete(request)).rejects.toMatchObject({ kind: "malformed-response" });
  });

  it("reports network failures and its own timeout as LlmErrors", async () => {
    const down = providerWith(() => {
      throw new TypeError("fetch failed");
    });
    await expect(down.complete(request)).rejects.toMatchObject({ kind: "network" });

    const slow = providerWith(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    await expect(slow.complete(request)).rejects.toMatchObject({ kind: "timeout" });
  });

  it("reports a body that fails mid-stream as a transport problem, not a malformed response", async () => {
    const provider = providerWith(
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{"content":['));
            },
            pull(controller) {
              controller.error(new TypeError("terminated"));
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    await expect(provider.complete(request)).rejects.toMatchObject({ kind: "network" });
  });

  it("lets a caller's own abort through untouched", async () => {
    const controller = new AbortController();
    const provider = providerWith(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const pending = provider.complete(request, controller.signal);
    controller.abort(new Error("client went away"));
    await expect(pending).rejects.toThrow("client went away");
  });
});
