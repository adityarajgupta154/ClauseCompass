import { LlmError, type LlmErrorKind } from "./provider";

export const DEFAULT_TIMEOUT_MS = 30_000;

interface PostJsonOptions {
  url: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs: number;
  signal?: AbortSignal;
  fetch: typeof fetch;
  provider: "Anthropic" | "Gemini";
  errorKind: (status: number) => LlmErrorKind;
  errorType: (json: unknown) => string | undefined;
}

export async function postJson(options: PostJsonOptions): Promise<{ status: number; json: unknown }> {
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const transportError = (err: unknown): never => {
    if (timeout.aborted) {
      throw new LlmError("timeout", `${options.provider} API call exceeded ${options.timeoutMs} ms`, undefined, {
        cause: err,
      });
    }
    if (options.signal?.aborted) throw err;
    throw new LlmError("network", `${options.provider} API could not be reached`, undefined, { cause: err });
  };

  let response: Response;
  try {
    response = await options.fetch(`${options.url.replace(/\/+$/, "")}/${options.path.replace(/^\/+/, "")}`, {
      method: "POST",
      headers: options.headers,
      body: JSON.stringify(options.body),
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
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
    const type = options.errorType(json) ?? "unknown";
    throw new LlmError(
      options.errorKind(response.status),
      `${options.provider} API responded ${response.status} (${type})`,
      response.status,
    );
  }

  return { status: response.status, json };
}