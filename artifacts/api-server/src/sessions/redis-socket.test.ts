import { createServer, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { FakeUpstash, LATE_ANSWER_MS } from "../testing/upstash-fake";
import { RedisSocket } from "./redis-socket";
import { isPrivateHost, parseRedisUrl } from "./redis-url";
import { encodeCommand, encodeReply, RespDecoder, RespError, RespProtocolError } from "./resp";
import { SessionStoreUnavailableError } from "./store";

/**
 * The socket client on its own: what it puts on the wire and what it makes
 * of what comes back, against the stand-in's RESP listener
 * (testing/upstash-fake.ts) and against servers built here to misbehave in
 * one way each. The store's use of it is covered in store.test.ts.
 */

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function fakeAt(): Promise<{ fake: FakeUpstash; url: string; client: RedisSocket }> {
  const fake = new FakeUpstash();
  const url = await fake.listenSocket();
  const client = new RedisSocket({ url, timeoutMs: 500 });
  cleanups.push(() => client.close(), () => fake.close());
  return { fake, url, client };
}

describe("parseRedisUrl", () => {
  it("reads host, port, TLS, credentials and the database number, with Redis's defaults", () => {
    expect(parseRedisUrl("redis://db.example.org")).toEqual({ host: "db.example.org", port: 6379, tls: false, username: undefined, password: undefined, db: 0 });
    expect(parseRedisUrl("rediss://default:p%40ss@db.example.org:6380/2")).toEqual({ host: "db.example.org", port: 6380, tls: true, username: "default", password: "p@ss", db: 2 });
    expect(parseRedisUrl("redis://:only-a-password@127.0.0.1:6379/")).toMatchObject({ username: undefined, password: "only-a-password", db: 0 });
    expect(parseRedisUrl("redis://[::1]:6379")).toMatchObject({ host: "::1", port: 6379 });
  });

  it("refuses anything else, saying what is wrong", () => {
    expect(() => parseRedisUrl("not a url")).toThrow("not a URL");
    expect(() => parseRedisUrl("https://db.upstash.io")).toThrow("scheme must be redis:// or rediss://");
    expect(() => parseRedisUrl("redis://")).toThrow(/not a URL|no host/);
    expect(() => parseRedisUrl("redis://host/sessions")).toThrow("database number");
    expect(() => parseRedisUrl("redis://host/99999999999999999999")).toThrow("database number is too large");
    expect(() => parseRedisUrl("redis://host:0")).toThrow("port must be 1 to 65535");
    expect(() => parseRedisUrl("redis://host?db=1")).toThrow("query strings");
    expect(() => parseRedisUrl("redis://default:p%zz@host")).toThrow("not valid percent-encoding");
  });

  it("places this machine and its private network, and nothing it cannot place without a lookup", () => {
    for (const host of ["localhost", "127.0.0.1", "127.8.0.1", "10.2.3.4", "172.16.0.1", "172.31.255.255", "192.168.1.1", "::1", "fd12::1", "fe80::1", "::ffff:7f00:1", "::ffff:10.0.0.1"]) {
      expect(isPrivateHost(host), host).toBe(true);
    }
    for (const host of ["db.example.org", "redis.internal", "8.8.8.8", "172.32.0.1", "192.169.0.1", "2001:db8::1", "::ffff:808:808"]) {
      expect(isPrivateHost(host), host).toBe(false);
    }
  });
});

describe("RESP framing", () => {
  it("encodes a command as an array of bulk strings, bytes counted not characters", () => {
    expect(encodeCommand(["HSET", "k", "नमस्ते", 7]).toString()).toBe("*4\r\n$4\r\nHSET\r\n$1\r\nk\r\n$18\r\nनमस्ते\r\n$1\r\n7\r\n");
  });

  it("decodes every reply type, including one split at any byte", () => {
    const wire = Buffer.concat([
      Buffer.from("+OK\r\n"),
      Buffer.from("-ERR no\r\n"),
      Buffer.from(":-3\r\n"),
      encodeReply("a\r\nb"),
      Buffer.from("$-1\r\n"),
      encodeReply([1, "x", null, [new RespError("nested")]]),
      Buffer.from("*-1\r\n"),
    ]);
    const expected = ["OK", new RespError("ERR no"), -3, "a\r\nb", null, [1, "x", null, [new RespError("nested")]], null];
    for (const at of [1, 4, 9, 14, 20, wire.length - 1]) {
      const decoder = new RespDecoder();
      const values = [...decoder.push(wire.subarray(0, at)), ...decoder.push(wire.subarray(at))];
      expect(values).toEqual(expected);
    }
  });

  it("refuses bytes that are not the protocol rather than guessing", () => {
    expect(() => new RespDecoder().push(Buffer.from("HTTP/1.1 400 Bad Request\r\n"))).toThrow(RespProtocolError);
    expect(() => new RespDecoder().push(Buffer.from("$x\r\n"))).toThrow(RespProtocolError);
    expect(() => new RespDecoder().push(Buffer.from("$2\r\nabc\r\n"))).toThrow(RespProtocolError);
    expect(() => new RespDecoder(16).push(Buffer.from("$100\r\n" + "a".repeat(20)))).toThrow(/exceeded 16 bytes/);
  });
});

describe("RedisSocket", () => {
  it("authenticates first, then answers commands with Redis's values: integers, strings, nil, arrays", async () => {
    const { fake, client } = await fakeAt();
    expect(await client.command(["HSET", "h", "a", "1", "b", "2"])).toBe(2);
    expect(await client.command(["HGET", "h", "a"])).toBe("1");
    expect(await client.command(["HGET", "h", "missing"])).toBeNull();
    expect(await client.command(["HGETALL", "h"])).toEqual(["a", "1", "b", "2"]);
    expect(await client.command(["DBSIZE"])).toBe(1);
    expect(fake.commands[0]).toEqual(["HSET", "h", "a", "1", "b", "2"]);
    expect(fake.connections).toBe(1);
  });

  it("is refused without the password, and with the wrong one, as a store-unavailable failure that names Redis's reason", async () => {
    const { fake, url } = await fakeAt();
    const anonymous = new RedisSocket({ url: url.replace(/\/\/[^@]*@/, "//"), timeoutMs: 500 });
    cleanups.push(() => anonymous.close());
    await expect(anonymous.command(["DBSIZE"])).rejects.toThrow(/refused a command: NOAUTH/);
    const wrong = new RedisSocket({ url: url.replace(fake.token, "not-the-password"), timeoutMs: 500 });
    cleanups.push(() => wrong.close());
    const failure = await wrong.command(["DBSIZE"]).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SessionStoreUnavailableError);
    expect((failure as Error).message).toMatch(/refused a command: WRONGPASS/);
    expect((failure as Error).message).not.toContain("not-the-password");
    expect(fake.commands).toEqual([]);
  });

  it("carries a value of a megabyte both ways, however the bytes are chunked", async () => {
    const { client } = await fakeAt();
    const value = "x".repeat(1024 * 1024) + "नमस्ते";
    expect(await client.command(["HSET", "big", "v", value])).toBe(1);
    expect(await client.command(["HGET", "big", "v"])).toBe(value);
  });

  it("runs concurrent commands over one connection, in order", async () => {
    const { fake, client } = await fakeAt();
    const replies = await Promise.all(Array.from({ length: 20 }, (_, index) => client.command(["HSET", "h", `f${index}`, String(index)])));
    expect(replies).toEqual(Array.from({ length: 20 }, () => 1));
    expect(fake.commands.map((command) => command[2])).toEqual(Array.from({ length: 20 }, (_, index) => `f${index}`));
    expect(fake.connections).toBe(1);
  });

  it("answers a pipeline in order and a transaction as one EXEC, refusing a transaction that did not run whole", async () => {
    const { fake, client } = await fakeAt();
    expect(await client.pipeline([["HSET", "p", "a", "1"], ["HGET", "p", "a"], ["HGET", "p", "b"]])).toEqual([1, "1", null]);
    expect(await client.transaction([["HSET", "t", "a", "1"], ["PEXPIRE", "t", "1000"], ["PTTL", "t"]])).toEqual([1, 1, 1000]);
    expect(fake.commands.slice(-3).map((command) => command[0])).toEqual(["HSET", "PEXPIRE", "PTTL"]);
    // Redis refuses an unknown command as it is queued and discards the transaction at EXEC; nothing of it is applied, and the connection is in step for the next command.
    await expect(client.transaction([["HSET", "t", "b", "2"], ["NOSUCH"]])).rejects.toThrow(/refused a command: ERR unknown command 'NOSUCH'/);
    expect(await client.command(["HGET", "t", "b"])).toBeNull();
    expect(fake.connections).toBe(1);
  });

  it("fails as store-unavailable when nothing listens, and the next command tries again", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const client = new RedisSocket({ url: `redis://127.0.0.1:${port}`, timeoutMs: 500 });
    cleanups.push(() => client.close());
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const failure = await client.command(["DBSIZE"]).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(SessionStoreUnavailableError);
      expect((failure as Error).message).toBe("the session store could not be reached");
      expect(((failure as Error).cause as NodeJS.ErrnoException).code).toBe("ECONNREFUSED");
    }
  });

  it("drops a connection that stops answering, or is cut, or talks something else, and opens a new one for the next command", async () => {
    const { fake, client } = await fakeAt();
    await client.command(["HSET", "h", "a", "1"]);
    fake.failNext("hang");
    await expect(client.command(["HGET", "h", "a"])).rejects.toThrow(/did not answer within 500 ms/);
    expect(await client.command(["HGET", "h", "a"])).toBe("1");
    expect(fake.connections).toBe(2);
    fake.failNext("network");
    await expect(client.command(["HGET", "h", "a"])).rejects.toBeInstanceOf(SessionStoreUnavailableError);
    expect(await client.command(["HGET", "h", "a"])).toBe("1");
    expect(fake.connections).toBe(3);
    fake.failNext("garbage");
    await expect(client.command(["HGET", "h", "a"])).rejects.toThrow(/answered in an unexpected shape/);
    expect(await client.command(["HGET", "h", "a"])).toBe("1");
    expect(fake.connections).toBe(4);
  });

  it("fails every command in flight when the connection is cut, none of them with another's answer", async () => {
    const { fake, client } = await fakeAt();
    await client.command(["HSET", "h", "a", "1"]);
    fake.failNext("network");
    const results = await Promise.allSettled([client.command(["HGET", "h", "a"]), client.command(["HGET", "h", "a"]), client.command(["DBSIZE"])]);
    expect(results.map((result) => result.status)).toEqual(["rejected", "rejected", "rejected"]);
    expect(await client.command(["HGET", "h", "a"])).toBe("1");
  });

  it("gives up on a server that accepts the connection and never speaks", async () => {
    const stalled = createSilentServer();
    cleanups.push(stalled.close);
    const client = new RedisSocket({ url: `redis://:pw@127.0.0.1:${await stalled.port}`, timeoutMs: 100 });
    cleanups.push(() => client.close());
    await expect(client.command(["DBSIZE"])).rejects.toThrow(/did not answer within 100 ms/);
  });

  it("fails rather than speaking in the clear when rediss:// meets a server without TLS", async () => {
    const { fake, url } = await fakeAt();
    const client = new RedisSocket({ url: url.replace("redis://", "rediss://"), timeoutMs: 500 });
    cleanups.push(() => client.close());
    await expect(client.command(["DBSIZE"])).rejects.toBeInstanceOf(SessionStoreUnavailableError);
    expect(fake.commands).toEqual([]);
  });

  it("closes its connection on close(), and opens another if asked again", async () => {
    const { fake, client } = await fakeAt();
    await client.command(["DBSIZE"]);
    await client.close();
    await client.close();
    expect(await client.command(["DBSIZE"])).toBe(0);
    expect(fake.connections).toBe(2);
  });

  it("leaves no connection behind when close() lands while one is being opened and another command follows", async () => {
    const { fake, client } = await fakeAt();
    // The first connection's AUTH is answered late; close() arrives meanwhile, then a command that opens a second connection,
    // whose handshake finishes first. The late one must be dropped, not kept as the current connection.
    fake.failNext("late");
    const first = client.command(["DBSIZE"]);
    await settle();
    const closing = client.close();
    const second = client.command(["DBSIZE"]);
    await expect(first).rejects.toThrow(/client was closed/);
    await closing;
    expect(await second).toBe(0);
    expect(fake.connections).toBe(2);
    await settle(LATE_ANSWER_MS * 2);
    expect(fake.openSockets).toBe(1);
    await client.close();
    await settle();
    expect(fake.openSockets).toBe(0);
  });

  it("drops a connection whose handshake completes only after close(), and opens a fresh one for the next command", async () => {
    const { fake, client } = await fakeAt();
    fake.failNext("late");
    const first = client.command(["DBSIZE"]);
    await settle();
    await client.close();
    await expect(first).rejects.toThrow(/client was closed/);
    await settle();
    expect(fake.openSockets).toBe(0);
    expect(await client.command(["DBSIZE"])).toBe(0);
    expect(fake.connections).toBe(2);
  });
});

/** Lets connections open, close and late answers arrive. */
function settle(ms = 30): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A server that accepts connections and never writes. */
function createSilentServer() {
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => sockets.add(socket));
  const port = new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port)));
  return {
    port,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
