import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { REDIS_SCRIPTS } from "../sessions/redis-store";

/**
 * Test support: an in-process stand-in for the Upstash Redis REST API, as
 * far as sessions/redis-store.ts uses it. It speaks the same HTTP shape
 * (`POST /`, `/pipeline`, `/multi-exec`; a JSON array per command; `{ result }`
 * or `{ error }` per reply; a bearer token) and keeps hashes with a TTL, so
 * the real client and the real store run against it unchanged. The three
 * scripts the store EVALs are recognised by their text and run as Redis
 * would run them.
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

export class FakeUpstash {
  readonly token = "fake-upstash-token";
  /** Every command received, in order, for assertions about what left the process. */
  readonly commands: string[][] = [];
  private readonly keys = new Map<string, Entry>();
  private server: Server | undefined;
  private failure: { status: number; error: string } | "network" | undefined;
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
        if (this.failure === "network") {
          this.failure = undefined;
          req.socket.destroy();
          return;
        }
        if (this.failure) {
          const { status, error } = this.failure;
          this.failure = undefined;
          res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify({ error }));
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

  async close(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = undefined;
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }

  /** The next request fails this way; the one after is answered normally. */
  failNext(failure: { status: number; error: string } | "network"): void {
    this.failure = failure;
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
