import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtractedDocument } from "../extraction";
import { SessionStore, SessionStoreFullError, type CreateSessionInput } from "./store";

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

function storeAt(start: number, ttlMs = 60_000, maxSessions = 3) {
  let now = start;
  const store = new SessionStore<Outputs>({ ttlMs, maxSessions, now: () => now, sweepEveryMs: 1_000 });
  return { store, tick: (ms: number) => (now += ms) };
}

const stores: SessionStore<Outputs>[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  vi.useRealTimers();
});

describe("SessionStore", () => {
  it("creates a session with a fresh id, the documents, and an expiry one TTL out", () => {
    const { store } = storeAt(1_000);
    stores.push(store);
    const a = store.create(input);
    const b = store.create(input);
    expect(a.id).not.toBe(b.id);
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.documents).toEqual(input.documents);
    expect(a.documents).not.toBe(input.documents);
    expect(a.createdAt).toBe(1_000);
    expect(a.expiresAt).toBe(61_000);
    expect(a.outputs).toEqual({});
    expect(a.deleted).toBe(false);
    expect(a.signal.aborted).toBe(false);
    expect(store.size).toBe(2);
  });

  it("slides the expiry on every read", () => {
    const { store, tick } = storeAt(0);
    stores.push(store);
    const { id } = store.create(input);
    tick(50_000);
    expect(store.get(id)?.expiresAt).toBe(110_000);
    tick(50_000);
    expect(store.get(id)?.expiresAt).toBe(160_000);
    tick(60_000);
    expect(store.get(id)).toBeUndefined();
    expect(store.size).toBe(0);
  });

  it("moves the expiry for the owner's read only; anyone else's lookup or delete leaves the session exactly as it was", () => {
    const { store, tick } = storeAt(0);
    stores.push(store);
    const session = store.create(input);
    const { id } = session;
    tick(50_000);
    expect(store.getOwned(id, "reader-2")).toBeUndefined();
    expect(store.isSomeoneElses(id, "reader-2")).toBe(true);
    expect(store.deleteOwned(id, "reader-2")).toBe(false);
    expect(session.expiresAt).toBe(60_000);
    expect(store.getOwned(id, "reader-1")?.expiresAt).toBe(110_000);
    expect(store.isSomeoneElses(id, "reader-1")).toBe(false);
    expect(store.deleteOwned(id, "reader-1")).toBe(true);
    expect(store.getOwned(id, "reader-1")).toBeUndefined();
    expect(store.isSomeoneElses(id, "reader-2")).toBe(false);
    expect(store.size).toBe(0);
  });

  it("expires a session that nothing touched, on read or by the sweep", () => {
    const { store, tick } = storeAt(0);
    stores.push(store);
    const idle = store.create(input);
    const active = store.create(input);
    tick(59_999);
    expect(store.get(active.id)).toBe(active);
    tick(1);
    expect(store.sweep()).toBe(1);
    expect(idle.deleted).toBe(true);
    expect(idle.signal.aborted).toBe(true);
    expect(active.deleted).toBe(false);
    expect(store.get(idle.id)).toBeUndefined();
    expect(store.size).toBe(1);
  });

  it("runs the sweep on a timer while sessions exist", () => {
    vi.useFakeTimers();
    let now = 0;
    const store = new SessionStore<Outputs>({ ttlMs: 60_000, maxSessions: 3, now: () => now, sweepEveryMs: 1_000 });
    stores.push(store);
    const session = store.create(input);
    now = 60_000;
    vi.advanceTimersByTime(1_000);
    expect(session.deleted).toBe(true);
    expect(store.size).toBe(0);
  });

  it("deletes at once, aborts the session's signal, and empties what a stale reference could still reach", () => {
    const { store } = storeAt(0);
    stores.push(store);
    const session = store.create(input);
    session.outputs.documentMap = { fields: 6 };
    session.pending.reviewPrompts = Promise.resolve({ prompts: 3 });
    let aborted = false;
    session.signal.addEventListener("abort", () => {
      aborted = true;
    });

    expect(store.delete(session.id)).toBe(true);
    expect(aborted).toBe(true);
    expect(session.deleted).toBe(true);
    expect(session.documents).toEqual([]);
    expect(session.outputs).toEqual({});
    expect(session.pending).toEqual({});
    expect(store.get(session.id)).toBeUndefined();
    expect(store.delete(session.id)).toBe(false);
    expect(store.size).toBe(0);
  });

  it("refuses new sessions at capacity, and takes them again once one goes", () => {
    const { store, tick } = storeAt(0, 60_000, 2);
    stores.push(store);
    const first = store.create(input);
    store.create(input);
    expect(() => store.create(input)).toThrow(SessionStoreFullError);
    store.delete(first.id);
    expect(() => store.create(input)).not.toThrow();
    // Expired sessions do not count: create sweeps first.
    tick(60_000);
    expect(() => store.create(input)).not.toThrow();
    expect(store.size).toBe(1);
  });

  it("close() deletes everything", () => {
    const { store } = storeAt(0);
    const a = store.create(input);
    const b = store.create(input);
    store.close();
    expect(store.size).toBe(0);
    expect(a.deleted && b.deleted).toBe(true);
  });

  it("rejects a store that could not expire or hold anything", () => {
    expect(() => new SessionStore({ ttlMs: 0, maxSessions: 1 })).toThrow(RangeError);
    expect(() => new SessionStore({ ttlMs: 1, maxSessions: 0 })).toThrow(RangeError);
  });
});
