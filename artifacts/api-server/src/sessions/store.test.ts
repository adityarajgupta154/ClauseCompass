import { createServer } from "node:http";
import type { Socket } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtractedDocument } from "../extraction";
import { FakeUpstash } from "../testing/upstash-fake";
import { MemorySessionStore } from "./memory-store";
import { RedisSessionStore } from "./redis-store";
import { SealedCodec, SealedValueError } from "./sealed";
import { SessionStoreFullError, SessionStoreUnavailableError, type CreateSessionInput, type SessionStore } from "./store";
import { UpstashRest } from "./upstash-rest";

/**
 * The store contract (store.ts), run against both stores: the memory store
 * as it is, and the Redis store through the real REST client against the
 * in-process stand-in for the Upstash API (testing/upstash-fake.ts). What
 * differs between them is tested on its own below: the Redis store's
 * sealing of every value, its answer when the database is unreachable, and
 * that two store instances over one database see the same sessions.
 */

const document: ExtractedDocument = {
  kind: "txt",
  pageCount: null,
  wordCount: 3,
  chunks: [{ text: "Rent is due.", page: null, paragraphIndex: 1 }],
};

const input: CreateSessionInput = { ownerUid: "reader-1", stage: "before-signing", documents: [{ slot: "primary", name: "lease.txt", document }] };

interface Outputs extends Record<"documentMap" | "reviewPrompts" | "compare", unknown> {
  documentMap: { fields: number };
  reviewPrompts: { prompts: number };
  compare: { changes: number };
}

interface Harness {
  store: SessionStore<Outputs>;
  tick: (ms: number) => void;
  close: () => Promise<void>;
}

const KEY = Buffer.alloc(32, 7);

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.useRealTimers();
});

const harnesses: Record<"memory" | "redis", (start: number, ttlMs?: number, maxSessions?: number) => Promise<Harness>> = {
  async memory(start, ttlMs = 60_000, maxSessions = 3) {
    let now = start;
    const store = new MemorySessionStore<Outputs>({ ttlMs, maxSessions, now: () => now, sweepEveryMs: 1_000 });
    const close = () => store.close();
    cleanups.push(close);
    return { store, tick: (ms) => (now += ms), close };
  },
  async redis(start, ttlMs = 60_000, maxSessions = 3) {
    let now = start;
    const fake = new FakeUpstash(() => now);
    const url = await fake.listen();
    const store = new RedisSessionStore<Outputs>({
      ttlMs,
      maxSessions,
      now: () => now,
      redis: new UpstashRest({ url, token: fake.token }),
      codec: new SealedCodec(KEY),
    });
    const close = () => fake.close();
    cleanups.push(close);
    return { store, tick: (ms) => (now += ms), close };
  },
};

describe.each(["memory", "redis"] as const)("SessionStore contract: %s", (kind) => {
  const storeAt = harnesses[kind];

  it("creates a session with a fresh id, the documents, and an expiry one TTL out", async () => {
    const { store } = await storeAt(1_000);
    const a = await store.create(input);
    const b = await store.create(input);
    expect(store.kind).toBe(kind);
    expect(a.id).not.toBe(b.id);
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.documents).toEqual(input.documents);
    expect(a.documents).not.toBe(input.documents);
    expect(a.ownerUid).toBe("reader-1");
    expect(a.stage).toBe("before-signing");
    expect(a.documentType).toBeUndefined();
    expect(a.createdAt).toBe(1_000);
    expect(a.expiresAt).toBe(61_000);
    expect(a.outputs).toEqual({});
    expect(await store.size()).toBe(2);
  });

  it("finds the owner's session as created, and slides the expiry on every find", async () => {
    const { store, tick } = await storeAt(0);
    const { id } = await store.create({ ...input, documentType: "rental" });
    tick(50_000);
    const first = await store.find(id, "reader-1");
    expect(first.outcome).toBe("found");
    if (first.outcome !== "found") return;
    expect(first.session).toMatchObject({ id, ownerUid: "reader-1", stage: "before-signing", documentType: "rental", createdAt: 0, expiresAt: 110_000, outputs: {} });
    expect(first.session.documents).toEqual(input.documents);
    tick(50_000);
    const second = await store.find(id, "reader-1");
    expect(second.outcome === "found" && second.session.expiresAt).toBe(160_000);
    tick(60_000);
    expect(await store.find(id, "reader-1")).toEqual({ outcome: "missing" });
    expect(await store.size()).toBe(0);
  });

  it("moves the expiry for the owner only; anyone else's lookup or delete leaves the session exactly as it was", async () => {
    const { store, tick } = await storeAt(0);
    const { id } = await store.create(input);
    tick(50_000);
    expect(await store.find(id, "reader-2")).toEqual({ outcome: "foreign" });
    expect(await store.deleteOwned(id, "reader-2")).toBe(false);
    // Not touched: it still expires 60 s after creation.
    tick(10_000);
    expect(await store.find(id, "reader-1")).toEqual({ outcome: "missing" });
    expect(await store.find(id, "reader-2")).toEqual({ outcome: "missing" });
  });

  it("has() tells whether a live session exists without touching it", async () => {
    const { store, tick } = await storeAt(0);
    const { id } = await store.create(input);
    tick(59_999);
    expect(await store.has(id)).toBe(true);
    tick(1);
    expect(await store.has(id)).toBe(false);
    expect(await store.has("not-an-id")).toBe(false);
  });

  it("keeps an output with a live session, and refuses to keep one for a session that is gone", async () => {
    const { store, tick } = await storeAt(0);
    const { id } = await store.create(input);
    tick(30_000);
    expect(await store.saveOutput(id, "reader-1", "documentMap", { fields: 6 })).toBe(true);
    expect(await store.saveOutput(id, "reader-1", "compare", { changes: 2 })).toBe(true);
    const found = await store.find(id, "reader-1");
    expect(found.outcome === "found" && found.session.outputs).toEqual({ documentMap: { fields: 6 }, compare: { changes: 2 } });
    // saveOutput does not move the expiry: created at 0, found at 30 s, so gone at 90 s.
    tick(60_000);
    expect(await store.saveOutput(id, "reader-1", "reviewPrompts", { prompts: 3 })).toBe(false);
    expect(await store.find(id, "reader-1")).toEqual({ outcome: "missing" });
  });

  it("hands out snapshots: changing one changes nothing in the store", async () => {
    const { store } = await storeAt(0);
    const created = await store.create(input);
    (created.outputs as Outputs).documentMap = { fields: 1 };
    (created.documents as unknown[]).length = 0;
    const found = await store.find(created.id, "reader-1");
    expect(found.outcome === "found" && found.session.outputs).toEqual({});
    expect(found.outcome === "found" && found.session.documents).toEqual(input.documents);
  });

  it("deletes at once and idempotently, for the owner only", async () => {
    const { store } = await storeAt(0);
    const { id } = await store.create(input);
    await store.saveOutput(id, "reader-1", "documentMap", { fields: 6 });
    expect(await store.deleteOwned(id, "reader-1")).toBe(true);
    expect(await store.find(id, "reader-1")).toEqual({ outcome: "missing" });
    expect(await store.has(id)).toBe(false);
    expect(await store.deleteOwned(id, "reader-1")).toBe(false);
    expect(await store.size()).toBe(0);
  });

  it("refuses new sessions at capacity, and takes them again once one goes or expires", async () => {
    const { store, tick } = await storeAt(0, 60_000, 2);
    const first = await store.create(input);
    await store.create(input);
    await expect(store.create(input)).rejects.toThrow(SessionStoreFullError);
    await store.deleteOwned(first.id, "reader-1");
    await expect(store.create(input)).resolves.toBeDefined();
    tick(60_000);
    await expect(store.create(input)).resolves.toBeDefined();
    expect(await store.size()).toBe(1);
  });

  it("rejects a store that could not expire or hold anything", async () => {
    const { store } = await storeAt(0);
    const construct = (ttlMs: number, maxSessions: number) =>
      kind === "memory"
        ? new MemorySessionStore({ ttlMs, maxSessions })
        : new RedisSessionStore({ ttlMs, maxSessions, redis: (store as RedisSessionStore<Outputs>)["redis"], codec: new SealedCodec(KEY) });
    expect(() => construct(0, 1)).toThrow(RangeError);
    expect(() => construct(1, 0)).toThrow(RangeError);
  });
});

describe("MemorySessionStore on its own", () => {
  it("runs the sweep on a timer while sessions exist, and close() empties it", async () => {
    vi.useFakeTimers();
    let now = 0;
    const store = new MemorySessionStore<Outputs>({ ttlMs: 60_000, maxSessions: 3, now: () => now, sweepEveryMs: 1_000 });
    cleanups.push(() => store.close());
    const idle = await store.create(input);
    now = 60_000;
    vi.advanceTimersByTime(1_000);
    expect(await store.has(idle.id)).toBe(false);
    expect(await store.size()).toBe(0);
    await store.create(input);
    await store.create(input);
    await store.close();
    expect(await store.size()).toBe(0);
  });
});

describe("RedisSessionStore on its own", () => {
  async function redisAt(start = 0) {
    let now = start;
    const fake = new FakeUpstash(() => now);
    const url = await fake.listen();
    cleanups.push(() => fake.close());
    const open = (key = KEY, token = fake.token) =>
      new RedisSessionStore<Outputs>({ ttlMs: 60_000, maxSessions: 3, now: () => now, redis: new UpstashRest({ url, token }), codec: new SealedCodec(key) });
    return { fake, open, tick: (ms: number) => (now += ms) };
  }

  it("writes one hash per session with a TTL, the owner in the clear and nothing else readable", async () => {
    const { fake, open } = await redisAt();
    const store = open();
    const { id } = await store.create({ ...input, documentType: "rental" });
    await store.saveOutput(id, "reader-1", "documentMap", { fields: 6 });
    const key = `session:${id}`;
    expect(fake.size).toBe(1);
    expect(fake.pttl(key)).toBe(60_000);
    expect(fake.field(key, "owner")).toBe("reader-1");
    expect(JSON.parse(fake.field(key, "meta")!)).toEqual({ stage: "before-signing", documentType: "rental", createdAt: 0 });
    for (const field of ["doc:primary", "out:documentMap"]) {
      const stored = fake.field(key, field)!;
      expect(stored).toMatch(/^v1:[A-Za-z0-9+/]+=*$/);
      expect(stored).not.toContain("Rent");
      expect(Buffer.from(stored.slice(3), "base64").toString("latin1")).not.toContain("Rent");
    }
    // Nothing sent to the database carried the paragraph in the clear either.
    expect(JSON.stringify(fake.commands)).not.toContain("Rent is due");
  });

  it("is shared: a second store over the same database finds, extends and deletes the first one's session", async () => {
    const { fake, open, tick } = await redisAt();
    const first = open();
    const second = open();
    const { id } = await first.create(input);
    await first.saveOutput(id, "reader-1", "reviewPrompts", { prompts: 3 });
    tick(20_000);
    const found = await second.find(id, "reader-1");
    expect(found.outcome === "found" && found.session.outputs).toEqual({ reviewPrompts: { prompts: 3 } });
    expect(fake.pttl(`session:${id}`)).toBe(60_000);
    expect(await second.deleteOwned(id, "reader-1")).toBe(true);
    expect(await first.find(id, "reader-1")).toEqual({ outcome: "missing" });
  });

  it("drops a session whose values will not open under this key, and says so once", async () => {
    const { open } = await redisAt();
    const writer = open();
    const { id } = await writer.create(input);
    const unreadable: SealedValueError[] = [];
    const reader = new RedisSessionStore<Outputs>({
      ttlMs: 60_000,
      maxSessions: 3,
      redis: writer["redis"],
      codec: new SealedCodec(Buffer.alloc(32, 9)),
      onUnreadable: (error) => unreadable.push(error),
    });
    expect(await reader.find(id, "reader-1")).toEqual({ outcome: "missing" });
    expect(unreadable).toHaveLength(1);
    expect(unreadable[0]).toBeInstanceOf(SealedValueError);
    expect(await writer.has(id)).toBe(false);
  });

  it("does not open a session for a reader written into its owner field behind the API's back", async () => {
    const { fake, open } = await redisAt();
    const store = open();
    const { id } = await store.create(input);
    await store.saveOutput(id, "reader-1", "documentMap", { fields: 6 });
    // Whoever can write to the database swaps the owner for their own uid, then asks the API as that reader.
    fake.setField(`session:${id}`, "owner", "reader-2");
    expect(await store.find(id, "reader-2")).toEqual({ outcome: "missing" });
    expect(await store.has(id)).toBe(false);
  });

  it("holds the cap when creates race from several instances", async () => {
    const { open } = await redisAt();
    const stores = [open(), open(), open()];
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, index) => stores[index % 3]!.create(input)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(3);
    for (const result of results) {
      if (result.status === "rejected") expect(result.reason).toBeInstanceOf(SessionStoreFullError);
    }
    expect(await stores[0]!.size()).toBe(3);
  });

  it("treats a value altered in the database, or moved to another field, as unreadable", async () => {
    const { fake, open } = await redisAt();
    const store = open();
    const { id } = await store.create({ ...input, documents: [...input.documents, { slot: "newer", name: "v2.txt", document }] });
    const key = `session:${id}`;
    const sealed = fake.field(key, "doc:primary")!;
    fake.setField(key, "doc:primary", sealed.slice(0, -4) + "AAA=");
    expect(await store.find(id, "reader-1")).toEqual({ outcome: "missing" });
    const again = await store.create(input);
    fake.setField(`session:${again.id}`, "doc:newer", fake.field(`session:${again.id}`, "doc:primary")!);
    expect(await store.find(again.id, "reader-1")).toEqual({ outcome: "missing" });
  });

  it("answers every failure to reach the database as SessionStoreUnavailableError, and works again afterwards", async () => {
    const { fake, open } = await redisAt();
    const store = open();
    const { id } = await store.create(input);
    fake.failNext("network");
    await expect(store.find(id, "reader-1")).rejects.toBeInstanceOf(SessionStoreUnavailableError);
    fake.failNext({ status: 500, error: "ERR internal" });
    await expect(store.has(id)).rejects.toThrow(/answered 500: ERR internal/);
    fake.failNext({ status: 401, error: "Unauthorized" });
    await expect(store.size()).rejects.toThrow(/answered 401/);
    expect((await store.find(id, "reader-1")).outcome).toBe("found");
    await expect(open(KEY, "not-the-token").has(id)).rejects.toThrow(/401/);
  });

  it("gives up on a database that does not answer in time", async () => {
    const stalled = createStalledServer();
    cleanups.push(stalled.close);
    const store = new RedisSessionStore<Outputs>({ ttlMs: 60_000, maxSessions: 3, redis: new UpstashRest({ url: await stalled.url, token: "t", timeoutMs: 50 }), codec: new SealedCodec(KEY) });
    await expect(store.has("x")).rejects.toThrow(/could not be reached/);
  });
});

/** An HTTP server that accepts connections and never answers. */
function createStalledServer() {
  const sockets = new Set<Socket>();
  const server = createServer(() => {});
  server.on("connection", (socket) => sockets.add(socket));
  const url = new Promise<string>((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as { port: number }).port}`)));
  return {
    url,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
