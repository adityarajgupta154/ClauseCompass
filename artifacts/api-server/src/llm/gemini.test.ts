import { describe, expect, it } from "vitest";
import { createGeminiProvider, toGeminiSchema } from "./gemini";
import { LlmError, type LlmRequest } from "./provider";

/**
 * The adapter is exercised against a stubbed fetch: what goes on the wire,
 * how a function call comes back, and that a failure is reported by status
 * and the API's status string only, never by body.
 */

const request: LlmRequest = {
  model: "gemini-2.5-flash",
  system: "policy",
  user: "task",
  output: {
    name: "record_claims",
    description: "records",
    schema: { type: "object", additionalProperties: false, properties: { claims: { type: "array", items: { type: "object", additionalProperties: false } } } },
  },
  maxTokens: 848,
};

type Handler = (input: string, init: RequestInit) => Response | Promise<Response>;

function providerWith(handler: Handler, calls: Array<{ url: string; init: RequestInit }> = []) {
  const stub = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return handler(String(input), init ?? {});
  }) as typeof fetch;
  return createGeminiProvider({
    apiKey: "key-test",
    baseUrl: "https://example.test/gemini/v1beta/",
    fetch: stub,
    timeoutMs: 500,
  });
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const callResponse = (args: unknown, finishReason = "STOP") => ({
  candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "record_claims", args } }] }, finishReason }],
  usageMetadata: { promptTokenCount: 321, candidatesTokenCount: 12, totalTokenCount: 333 },
});

describe("Gemini provider", () => {
  it("posts one forced function call with the schema, the key header and the token cap", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const provider = providerWith(() => json(200, callResponse({ claims: [] })), calls);
    const response = await provider.complete(request);

    expect(response).toEqual({ output: { claims: [] }, stop: "complete", usage: { inputTokens: 321, outputTokens: 12 } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://example.test/gemini/v1beta/models/gemini-2.5-flash:generateContent");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe("key-test");
    const body = JSON.parse(calls[0]!.init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      systemInstruction: { parts: [{ text: "policy" }] },
      contents: [{ role: "user", parts: [{ text: "task" }] }],
      tools: [{ functionDeclarations: [{ name: "record_claims", description: "records" }] }],
      toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["record_claims"] } },
      generationConfig: { maxOutputTokens: 848, thinkingConfig: { thinkingBudget: 0 } },
    });
    expect(body.generationConfig).not.toHaveProperty("temperature");
  });

  it("sends the schema without additionalProperties at any level and keeps the rest", () => {
    expect(toGeminiSchema(request.output.schema)).toEqual({
      type: "object",
      properties: { claims: { type: "array", items: { type: "object" } } },
    });
    const kept = { type: "string", minLength: 1, maxLength: 5, enum: ["a"], description: "d" };
    expect(toGeminiSchema(kept)).toEqual(kept);
  });

  it("leaves thinking at the model's default outside the 2.5 Flash family", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const provider = providerWith(() => json(200, callResponse({ claims: [] })), calls);
    await provider.complete({ ...request, model: "gemini-2.5-pro" });
    const body = JSON.parse(calls[0]!.init.body as string) as { generationConfig: Record<string, unknown> };
    expect(body.generationConfig).toEqual({ maxOutputTokens: 848 });
    expect(calls[0]!.url).toContain("/models/gemini-2.5-pro:generateContent");
  });

  it("hands back text when the model answered without the function, so the validator rejects it", async () => {
    const provider = providerWith(() =>
      json(200, {
        candidates: [{ content: { role: "model", parts: [{ text: "I cannot " }, { text: "do that." }] }, finishReason: "STOP" }],
      }),
    );
    expect(await provider.complete(request)).toEqual({ output: "I cannot do that.", stop: "complete", usage: null });
  });

  it("reports an output-limit stop, counts thinking tokens as output, and fails a blocked prompt without a retry", async () => {
    const cut = providerWith(() =>
      json(200, {
        ...callResponse({ claims: [] }, "MAX_TOKENS"),
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2, thoughtsTokenCount: 5 },
      }),
    );
    expect(await cut.complete(request)).toMatchObject({ stop: "truncated", usage: { inputTokens: 10, outputTokens: 7 } });

    const blocked = providerWith(() => json(200, { promptFeedback: { blockReason: "PROHIBITED_CONTENT" } }));
    await expect(blocked.complete(request)).rejects.toMatchObject({
      name: "LlmError",
      kind: "bad-request",
      status: 200,
      message: "Gemini API blocked the prompt (PROHIBITED_CONTENT)",
    });

    const filtered = providerWith(() => json(200, { candidates: [{ finishReason: "SAFETY" }] }));
    expect(await filtered.complete(request)).toMatchObject({ output: "", stop: "other" });
  });

  it("maps API errors to a kind and status, keeping the body out of the message", async () => {
    const cases: Array<[number, string, LlmError["kind"]]> = [
      [401, "UNAUTHENTICATED", "auth"],
      [403, "PERMISSION_DENIED", "auth"],
      [429, "RESOURCE_EXHAUSTED", "rate-limited"],
      [503, "UNAVAILABLE", "overloaded"],
      [500, "INTERNAL", "upstream"],
      [400, "INVALID_ARGUMENT", "bad-request"],
    ];
    for (const [status, apiStatus, kind] of cases) {
      const provider = providerWith(() => json(status, { error: { code: status, status: apiStatus, message: "SECRET prompt echo" } }));
      const failure = await provider.complete(request).catch((err: unknown) => err);
      expect(failure).toBeInstanceOf(LlmError);
      const llmError = failure as LlmError;
      expect(llmError.kind).toBe(kind);
      expect(llmError.status).toBe(status);
      expect(llmError.message).toBe(`Gemini API responded ${status} (${apiStatus})`);
      expect(llmError.message).not.toContain("SECRET");
    }
  });

  it("treats a non-JSON error body and an unexpected success body as errors too", async () => {
    const html = providerWith(() => new Response("<html>bad gateway</html>", { status: 502 }));
    await expect(html.complete(request)).rejects.toMatchObject({ kind: "upstream", status: 502, message: "Gemini API responded 502 (unknown)" });

    const odd = providerWith(() => json(200, { candidates: "nope" }));
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
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason as Error));
        }),
    );
    await expect(slow.complete(request)).rejects.toMatchObject({ kind: "timeout" });
  });

  it("lets a caller's own abort through untouched", async () => {
    const controller = new AbortController();
    const provider = providerWith(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason as Error));
        }),
    );
    const pending = provider.complete(request, controller.signal);
    controller.abort(new Error("client went away"));
    await expect(pending).rejects.toThrow("client went away");
  });
});
