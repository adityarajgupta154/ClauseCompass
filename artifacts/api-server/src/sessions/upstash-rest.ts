import { SessionStoreUnavailableError } from "./store";

/**
 * The smallest client for the Upstash Redis REST API that redis-store.ts
 * needs: one command, a pipeline, or a MULTI/EXEC transaction, each a POST
 * of a JSON array of arguments, answered as `{ result }` or `{ error }`.
 * Written here rather than taken from a package so that what leaves the
 * process, and when, is all in one short file.
 *
 * Every failure to get an answer that a store could act on is a
 * SessionStoreUnavailableError: the network, a timeout, a non-2xx status,
 * a Redis-side error, or a body that is not the documented shape. The route
 * answers 503 and the request can be retried; nothing is guessed.
 */

export type RedisArg = string | number;
export type RedisCommand = readonly RedisArg[];

export interface RedisCommands {
  command(command: RedisCommand): Promise<unknown>;
  pipeline(commands: readonly RedisCommand[]): Promise<unknown[]>;
  /** The commands as one MULTI/EXEC: all applied or none. */
  transaction(commands: readonly RedisCommand[]): Promise<unknown[]>;
}

export interface UpstashRestOptions {
  /** The database's REST URL (https://…upstash.io). */
  url: string;
  token: string;
  /** How long one round trip may take; defaults to 8 s. */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

type Reply = { result: unknown } | { error: string };

function isReply(value: unknown): value is Reply {
  return typeof value === "object" && value !== null && ("result" in value || "error" in value);
}

export class UpstashRest implements RedisCommands {
  private readonly base: string;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: UpstashRestOptions) {
    this.base = options.url.replace(/\/+$/, "");
    this.headers = { authorization: `Bearer ${options.token}`, "content-type": "application/json" };
    this.timeoutMs = options.timeoutMs ?? 8_000;
    this.fetchImpl = options.fetch ?? fetch;
  }

  async command(command: RedisCommand): Promise<unknown> {
    const body = await this.post("", command.map(String));
    if (!isReply(body)) throw new SessionStoreUnavailableError("the session store answered in an unexpected shape");
    return unwrap(body);
  }

  pipeline(commands: readonly RedisCommand[]): Promise<unknown[]> {
    return this.batch("/pipeline", commands);
  }

  transaction(commands: readonly RedisCommand[]): Promise<unknown[]> {
    return this.batch("/multi-exec", commands);
  }

  private async batch(path: string, commands: readonly RedisCommand[]): Promise<unknown[]> {
    const body = await this.post(
      path,
      commands.map((command) => command.map(String)),
    );
    if (isReply(body)) {
      // A whole-batch failure (a transaction that could not run) comes back as one reply.
      unwrap(body);
      throw new SessionStoreUnavailableError("the session store answered a batch with a single reply");
    }
    if (!Array.isArray(body) || body.length !== commands.length || !body.every(isReply)) {
      throw new SessionStoreUnavailableError("the session store answered a batch in an unexpected shape");
    }
    return body.map(unwrap);
  }

  private async post(path: string, payload: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.base}${path}`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (cause) {
      throw new SessionStoreUnavailableError("the session store could not be reached", { cause });
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      throw new SessionStoreUnavailableError(`the session store answered ${response.status} without a JSON body`, { cause });
    }
    if (!response.ok) {
      const detail = isReply(body) && "error" in body ? `: ${body.error}` : "";
      throw new SessionStoreUnavailableError(`the session store answered ${response.status}${detail}`);
    }
    return body;
  }
}

function unwrap(reply: Reply): unknown {
  if ("error" in reply) throw new SessionStoreUnavailableError(`the session store refused a command: ${reply.error}`);
  return reply.result;
}
