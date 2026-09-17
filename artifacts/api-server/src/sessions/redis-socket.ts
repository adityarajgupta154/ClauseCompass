import { connect as connectPlain, isIP, type Socket } from "node:net";
import { connect as connectTls } from "node:tls";
import { parseRedisUrl, type RedisTarget } from "./redis-url";
import { encodeCommand, RespDecoder, RespError, type RespValue } from "./resp";
import { SessionStoreUnavailableError } from "./store";
import type { RedisCommand, RedisCommands } from "./upstash-rest";

/**
 * The smallest client for a Redis database reached over a socket, as
 * upstash-rest.ts is for one reached over HTTPS: a `redis://` or `rediss://`
 * URL as Redis Cloud, Upstash and most hosts hand one out (redis-url.ts
 * reads it). Written here rather than taken from a package so that what
 * leaves the process, and when, is all in one short file (resp.ts has the
 * bytes).
 *
 * One connection, opened on the first command and again after it is lost;
 * commands go out in order and Redis answers in order, so the replies are
 * matched to the commands by position. The URL's password is sent as AUTH
 * and its database number as SELECT before anything else on a connection.
 *
 * Every failure to get an answer that a store could act on is a
 * SessionStoreUnavailableError: a connection that cannot be made or is
 * lost, an answer that does not come in time, bytes that are not RESP, or
 * an error Redis answers with. When the failure is the connection's (lost,
 * silent, not speaking RESP) the connection is dropped and every command
 * still waiting on it fails too, because a reply that may belong to an
 * earlier command must never be read as the answer to a later one; the
 * next command opens a new connection. An error reply is an answer, in
 * order, so the connection is kept. The route answers 503 and the request
 * can be retried; nothing is guessed.
 */

export interface RedisSocketOptions {
  /** `redis://[user[:password]@]host[:port][/db]`, or `rediss://` for TLS. */
  url: string;
  /** How long a connection attempt, or one command's answer, may take; defaults to 8 s. */
  timeoutMs?: number;
}

interface Pending {
  resolve: (value: RespValue) => void;
  reject: (error: SessionStoreUnavailableError) => void;
  timer: NodeJS.Timeout;
}

interface Link {
  socket: Socket;
  decoder: RespDecoder;
  pending: Pending[];
  dropped: boolean;
  /** Set while the connection is being made, so a failure then rejects the attempt with its reason. */
  onDrop?: (error: SessionStoreUnavailableError) => void;
}

export class RedisSocket implements RedisCommands {
  private readonly target: RedisTarget;
  private readonly timeoutMs: number;
  private opening: Promise<Link> | undefined;
  private link: Link | undefined;

  constructor(options: RedisSocketOptions) {
    this.target = parseRedisUrl(options.url);
    this.timeoutMs = options.timeoutMs ?? 8_000;
  }

  async command(command: RedisCommand): Promise<unknown> {
    return unwrap(await this.send(await this.connected(), command));
  }

  async pipeline(commands: readonly RedisCommand[]): Promise<unknown[]> {
    const link = await this.connected();
    const replies = await Promise.all(commands.map((command) => this.send(link, command)));
    return replies.map(unwrap);
  }

  async transaction(commands: readonly RedisCommand[]): Promise<unknown[]> {
    const link = await this.connected();
    const replies = await Promise.all([["MULTI"], ...commands, ["EXEC"]].map((command) => this.send(link, command)));
    // MULTI answers OK, each queued command QUEUED (or an error, which EXEC then reports too), EXEC the array of results.
    replies.slice(0, -1).forEach(unwrap);
    const results = replies[replies.length - 1];
    if (!Array.isArray(results) || results.length !== commands.length) {
      throw new SessionStoreUnavailableError("the session store answered a transaction in an unexpected shape");
    }
    return results.map(unwrap);
  }

  /** Ends the connection, or the attempt to make one; a later command opens a new one. */
  async close(): Promise<void> {
    const { link, opening } = this;
    this.link = undefined;
    this.opening = undefined;
    if (link) this.drop(link, new SessionStoreUnavailableError("the session store client was closed"));
    // An attempt in flight sees it is no longer the current one when it completes, and drops what it made.
    if (opening) await opening.catch(() => undefined);
  }

  private connected(): Promise<Link> {
    if (this.link) return Promise.resolve(this.link);
    if (this.opening) return this.opening;
    // Each attempt hands its link over only while it is still the attempt in progress: close(), or a
    // failure, may have replaced or cleared it meanwhile, and an old attempt must not overwrite a newer one.
    const opening: Promise<Link> = this.open().then(
      (link) => {
        if (this.opening !== opening) {
          this.drop(link, new SessionStoreUnavailableError("the session store client was closed"));
          throw new SessionStoreUnavailableError("the session store client was closed");
        }
        this.opening = undefined;
        if (link.dropped) throw new SessionStoreUnavailableError("the session store closed the connection");
        this.link = link;
        return link;
      },
      (error: unknown) => {
        if (this.opening === opening) this.opening = undefined;
        throw error;
      },
    );
    this.opening = opening;
    return opening;
  }

  private async open(): Promise<Link> {
    const { host, port, tls, username, password, db } = this.target;
    // SNI names a host, never an address (RFC 6066); the certificate is still checked against `host` either way.
    const socket = tls ? connectTls({ host, port, ...(isIP(host) === 0 ? { servername: host } : {}) }) : connectPlain({ host, port });
    const link: Link = { socket, decoder: new RespDecoder(), pending: [], dropped: false };
    socket.setNoDelay(true);
    socket.on("data", (chunk: Buffer) => this.receive(link, chunk));
    socket.on("error", (cause: Error) => this.drop(link, new SessionStoreUnavailableError("the session store could not be reached", { cause })));
    socket.on("close", () => this.drop(link, new SessionStoreUnavailableError("the session store closed the connection")));
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.drop(link, new SessionStoreUnavailableError(`the session store did not accept a connection within ${this.timeoutMs} ms`));
      }, this.timeoutMs);
      link.onDrop = (error) => {
        clearTimeout(timer);
        reject(error);
      };
      socket.once(tls ? "secureConnect" : "connect", () => {
        clearTimeout(timer);
        link.onDrop = undefined;
        resolve();
      });
    });
    socket.setKeepAlive(true, 30_000);
    // First on the wire: the link is not handed out until these have been answered.
    try {
      if (password !== undefined) unwrap(await this.send(link, username === undefined ? ["AUTH", password] : ["AUTH", username, password]));
      if (db !== 0) unwrap(await this.send(link, ["SELECT", db]));
    } catch (error) {
      this.drop(link, error instanceof SessionStoreUnavailableError ? error : new SessionStoreUnavailableError("the session store refused the connection", { cause: error }));
      throw error;
    }
    return link;
  }

  private send(link: Link, command: RedisCommand): Promise<RespValue> {
    return new Promise<RespValue>((resolve, reject) => {
      if (link.dropped) {
        reject(new SessionStoreUnavailableError("the session store closed the connection"));
        return;
      }
      const timer = setTimeout(() => {
        this.drop(link, new SessionStoreUnavailableError(`the session store did not answer within ${this.timeoutMs} ms`));
      }, this.timeoutMs);
      link.pending.push({ resolve, reject, timer });
      link.socket.write(encodeCommand(command));
    });
  }

  private receive(link: Link, chunk: Buffer): void {
    if (link.dropped) return;
    let replies: RespValue[];
    try {
      replies = link.decoder.push(chunk);
    } catch (cause) {
      this.drop(link, new SessionStoreUnavailableError("the session store answered in an unexpected shape", { cause }));
      return;
    }
    for (const reply of replies) {
      const pending = link.pending.shift();
      if (pending === undefined) {
        this.drop(link, new SessionStoreUnavailableError("the session store answered a command that was not sent"));
        return;
      }
      clearTimeout(pending.timer);
      pending.resolve(reply);
    }
  }

  /** The connection is finished with: every command still waiting fails with `error`, and the next command opens a new one. */
  private drop(link: Link, error: SessionStoreUnavailableError): void {
    if (link.dropped) return;
    link.dropped = true;
    if (this.link === link) this.link = undefined;
    link.onDrop?.(error);
    link.onDrop = undefined;
    for (const pending of link.pending.splice(0)) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    link.socket.destroy();
  }
}

function unwrap(reply: RespValue): unknown {
  if (reply instanceof RespError) throw new SessionStoreUnavailableError(`the session store refused a command: ${reply.message}`);
  return reply;
}
