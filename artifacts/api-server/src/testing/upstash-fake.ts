import { createServer, type Server } from "node:http";
import { createServer as createSocketServer, type AddressInfo, type Server as SocketServer, type Socket } from "node:net";
import { REDIS_SCRIPTS } from "../sessions/redis-store";
import { encodeReply, RespDecoder, RespError, type RespValue } from "../sessions/resp";

/**
 * Test support: an in-process stand-in for a Redis database, as far as
 * sessions/redis-store.ts uses one, reachable both ways the API reaches a
 * real one. `listen()` speaks the Upstash REST API's HTTP shape (`POST /`,
 * `/pipeline`, `/multi-exec`; a JSON array per command; `{ result }` or
 * `{ error }` per reply; a bearer token); `listenSocket()` speaks RESP2 on
 * a TCP port (AUTH with the same token as the password, MULTI/EXEC). Both
 * share one set of hashes with a TTL, so the real clients and the real
 * store run against it unchanged, and a session written over one transport
 * is read over the other. The scripts the store EVALs are recognised by
 * their text and run as Redis would run them.
 *
 * Time is injectable so a test can let sessions expire without waiting, and
 * the next answer can be made to fail so the store's 503 path is reachable.
 */

type Hash = Map<string, string>;

interface Entry {
  hash: Hash;
  /** Epoch ms; undefined means no TTL. */
  expiresAt?: number;
}

type Reply = { result: unknown } | { error: string };

/** The commands `execute` knows; the socket listener refuses any other at queue time, as Redis does. */
const KNOWN_COMMANDS = new Set(["HSET", "HGET", "HGETALL", "PEXPIRE", "PTTL", "DEL", "EXISTS", "DBSIZE", "EVAL"]);

/** How the next answer goes wrong: an HTTP status with a Redis error (REST only), the connection cut before answering, an answer that never comes, bytes that are not the protocol, or an answer that comes late (socket only, after LATE_ANSWER_MS). */
export type FakeFailure = { status: number; error: string } | "network" | "hang" | "garbage" | "late";

export const LATE_ANSWER_MS = 150;

export class FakeUpstash {
  readonly token = "fake-upstash-token";
  /** Every command received, in order, over either transport, for assertions about what left the process. */
  readonly commands: string[][] = [];
  /** How many socket connections have been opened, for assertions about when the client reconnects. */
  connections = 0;
  /** How many are open now, for assertions that the client leaves none behind. */
  get openSockets(): number {
    return this.sockets.size;
  }
  private readonly keys = new Map<string, Entry>();
  private server: Server | undefined;
  private socketServer: SocketServer | undefined;
  private readonly sockets = new Set<Socket>();
  private failure: FakeFailure | undefined;
  private clock: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.clock = now;
  }

  async listen(): Promise<string> {
    this.server = createServer((req, res) => {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk: string) => (body += chunk));
      req.on("end", () => {
        const failure = this.takeFailure();
        if (failure === "network") {
          req.socket.destroy();
          return;
        }
        if (failure === "hang") return;
        if (failure === "garbage") {
          res.writeHead(200, { "content-type": "application/json" }).end("not json");
          return;
        }
        if (failure === "late") throw new Error("a late answer is a socket failure; the REST stand-in has no use for one");
        if (failure) {
          res.writeHead(failure.status, { "content-type": "application/json" }).end(JSON.stringify({ error: failure.error }));
          return;
        }
        if (req.headers.authorization !== `Bearer ${this.token}`) {
          res.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }
        const payload = JSON.parse(body) as unknown;
        let reply: unknown;
        if (req.url === "/pipeline" || req.url === "/multi-exec") {
          reply = (payload as string[][]).map((command) => this.run(command));
        } else {
          reply = this.run(payload as string[]);
        }
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(reply));
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${(this.server!.address() as AddressInfo).port}`;
  }

  /**
   * The same database over RESP2. A connection must AUTH with `token` as
   * its password before anything else; MULTI queues until EXEC; the failure
   * set by failNext applies to the next command on whichever transport
   * receives it. Returns the redis:// URL, password included.
   */
  async listenSocket(): Promise<string> {
    this.socketServer = createSocketServer((socket) => {
      this.connections += 1;
      this.sockets.add(socket);
      socket.on("close", () => this.sockets.delete(socket));
      socket.on("error", () => socket.destroy());
      const decoder = new RespDecoder();
      let authenticated = false;
      let queued: string[][] | undefined;
      /** Set when a queued command was refused at queue time; EXEC then discards the transaction, as Redis does. */
      let aborted = false;
      /** One command's answer, written to the socket. */
      const answer = ([name, ...args]: string[]): void => {
        switch (name?.toUpperCase()) {
          case "AUTH": {
            const password = args[args.length - 1];
            const username = args.length === 2 ? args[0] : "default";
            authenticated = username === "default" && password === this.token;
            socket.write(encodeReply(authenticated ? "OK" : new RespError("WRONGPASS invalid username-password pair or user is disabled.")));
            return;
          }
          case "MULTI":
            queued = [];
            aborted = false;
            socket.write(encodeReply("OK"));
            return;
          case "EXEC": {
            const commands = queued ?? [];
            queued = undefined;
            if (aborted) {
              socket.write(encodeReply(new RespError("EXECABORT Transaction discarded because of previous errors.")));
              return;
            }
            socket.write(encodeReply(commands.map((command) => this.reply(command, authenticated))));
            return;
          }
          default:
            if (queued) {
              // Redis checks a command's name and arity as it is queued, and refuses it then.
              if (!KNOWN_COMMANDS.has(name?.toUpperCase() ?? "")) {
                aborted = true;
                socket.write(encodeReply(new RespError(`ERR unknown command '${name}', with args beginning with: ${args.map((arg) => `'${arg}'`).join(" ")}`)));
                return;
              }
              queued.push([name!, ...args]);
              socket.write(encodeReply("QUEUED"));
            } else {
              socket.write(encodeReply(this.reply([name!, ...args], authenticated)));
            }
        }
      };
      socket.on("data", (chunk: Buffer) => {
        let frames: RespValue[];
        try {
          frames = decoder.push(chunk);
        } catch {
          socket.destroy();
          return;
        }
        for (const frame of frames) {
          if (!Array.isArray(frame) || !frame.every((part): part is string => typeof part === "string")) {
            socket.destroy();
            return;
          }
          const failure = this.takeFailure();
          if (failure === "network") {
            socket.destroy();
            return;
          }
          if (failure === "hang") return;
          if (failure === "garbage") {
            socket.write("this is not RESP\r\n");
            return;
          }
          if (failure === "late") {
            // Answered after a pause; the tests that ask for it have nothing else in flight on the connection.
            setTimeout(() => {
              if (!socket.destroyed) answer(frame);
            }, LATE_ANSWER_MS);
            continue;
          }
          if (failure) {
            socket.write(encodeReply(new RespError(failure.error)));
            continue;
          }
          answer(frame);
        }
      });
    });
    await new Promise<void>((resolve) => this.socketServer!.listen(0, "127.0.0.1", resolve));
    return `redis://default:${this.token}@127.0.0.1:${(this.socketServer!.address() as AddressInfo).port}`;
  }

  async close(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (server) await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    const socketServer = this.socketServer;
    this.socketServer = undefined;
    if (socketServer) {
      for (const socket of this.sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => socketServer.close((err) => (err ? reject(err) : resolve())));
    }
  }

  /** The next request fails this way; the one after is answered normally. */
  failNext(failure: FakeFailure): void {
    this.failure = failure;
  }

  private takeFailure(): FakeFailure | undefined {
    const failure = this.failure;
    this.failure = undefined;
    return failure;
  }

  /** One command's RESP reply: the run's result, or its error as Redis words it. */
  private reply(command: string[], authenticated: boolean): RespValue {
    if (!authenticated) return new RespError("NOAUTH Authentication required.");
    const answer = this.run(command);
    return "error" in answer ? new RespError(answer.error) : toResp(answer.result);
  }

  /** Remaining life of a key in ms, or undefined when it does not exist. */
  pttl(key: string): number | undefined {
    const entry = this.live(key);
    return entry?.expiresAt === undefined ? undefined : entry.expiresAt - this.clock();
  }

  /** A field's stored value, as the database holds it. */
  field(key: string, field: string): string | undefined {
    return this.live(key)?.hash.get(field);
  }

  /** Overwrites a stored field, as someone with access to the database could. */
  setField(key: string, field: string, value: string): void {
    this.live(key)?.hash.set(field, value);
  }

  get size(): number {
    this.sweep();
    return this.keys.size;
  }

  private live(key: string): Entry | undefined {
    const entry = this.keys.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== undefined && entry.expiresAt <= this.clock()) {
      this.keys.delete(key);
      return undefined;
    }
    return entry;
  }

  private sweep(): void {
    for (const key of [...this.keys.keys()]) this.live(key);
  }

  private run(command: string[]): Reply {
    this.commands.push(command);
    try {
      return { result: this.execute(command) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  private execute([name, ...args]: string[]): unknown {
    switch (name?.toUpperCase()) {
      case "HSET": {
        const [key, ...pairs] = args;
        if (!key || pairs.length % 2 !== 0) throw new Error("ERR wrong number of arguments for 'hset' command");
        const entry = this.live(key) ?? { hash: new Map<string, string>() };
        let added = 0;
        for (let index = 0; index < pairs.length; index += 2) {
          if (!entry.hash.has(pairs[index]!)) added += 1;
          entry.hash.set(pairs[index]!, pairs[index + 1]!);
        }
        this.keys.set(key, entry);
        return added;
      }
      case "HGET":
        return this.live(args[0]!)?.hash.get(args[1]!) ?? null;
      case "HGETALL":
        return [...(this.live(args[0]!)?.hash.entries() ?? [])].flat();
      case "PEXPIRE": {
        const entry = this.live(args[0]!);
        if (!entry) return 0;
        entry.expiresAt = this.clock() + Number(args[1]);
        return 1;
      }
      case "PTTL":
        return this.pttl(args[0]!) ?? -2;
      case "DEL": {
        let removed = 0;
        for (const key of args) if (this.live(key)) removed += Number(this.keys.delete(key));
        return removed;
      }
      case "EXISTS":
        return args.filter((key) => this.live(key) !== undefined).length;
      case "DBSIZE":
        return this.size;
      case "EVAL":
        return this.evaluate(args[0]!, Number(args[1]), args.slice(2));
      default:
        throw new Error(`ERR unknown command '${name}'`);
    }
  }

  /** The store's four scripts, by text; anything else is refused as Redis refuses a script that fails to compile. */
  private evaluate(script: string, keyCount: number, rest: string[]): unknown {
    const keys = rest.slice(0, keyCount);
    const argv = rest.slice(keyCount);
    const key = keys[0]!;
    switch (script) {
      case REDIS_SCRIPTS.create: {
        if ((this.execute(["DBSIZE"]) as number) >= Number(argv[0])) return 0;
        this.execute(["HSET", key, ...argv.slice(2)]);
        this.execute(["PEXPIRE", key, argv[1]!]);
        return 1;
      }
      case REDIS_SCRIPTS.find: {
        const owner = this.execute(["HGET", key, "owner"]);
        if (owner === null) return null;
        if (owner !== argv[0]) return 0;
        this.execute(["PEXPIRE", key, argv[1]!]);
        return this.execute(["HGETALL", key]);
      }
      case REDIS_SCRIPTS.saveOutput: {
        if (this.execute(["EXISTS", key]) === 0) return 0;
        this.execute(["HSET", key, argv[0]!, argv[1]!]);
        return 1;
      }
      case REDIS_SCRIPTS.deleteOwned: {
        const owner = this.execute(["HGET", key, "owner"]);
        if (owner === null || owner !== argv[0]) return 0;
        this.execute(["DEL", key]);
        return 1;
      }
      default:
        throw new Error("ERR Error compiling script: unknown script");
    }
  }
}

/** A run's result as RESP carries it: integers, bulk strings, arrays and nil (the REST API's JSON shapes are the same values). */
function toResp(value: unknown): RespValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(toResp);
  throw new Error(`the fake produced a value RESP cannot carry: ${typeof value}`);
}
