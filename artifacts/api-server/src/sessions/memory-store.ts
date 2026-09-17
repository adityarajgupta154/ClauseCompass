import { randomUUID } from "node:crypto";
import {
  checkStoreOptions,
  OUTPUT_KINDS,
  SessionStoreFullError,
  type CreateSessionInput,
  type OutputKind,
  type SessionLookup,
  type SessionOutputs,
  type SessionRecord,
  type SessionStore,
  type SessionStoreOptions,
} from "./store";

/**
 * The store that holds sessions in this process (store.ts has the contract).
 *
 * - Expiry is checked on every lookup and by a sweep that runs while the
 *   store is non-empty; the timer is unref'd so it never keeps the process
 *   alive.
 * - Delete empties the entry as well as dropping it, so nothing about the
 *   document stays reachable through a reference some request still holds.
 * - The clock is injectable so the tests can move time instead of waiting.
 *
 * Sessions are not shared between processes, so a host that runs more than
 * one instance of the API needs redis-store.ts instead (config.ts refuses
 * this store where it knows that to be the case).
 */

export interface MemorySessionStoreOptions extends SessionStoreOptions {
  /** How often the sweep runs while sessions exist; defaults to min(ttl, 60 s). */
  sweepEveryMs?: number;
}

interface Entry<T extends Record<OutputKind, unknown>> {
  readonly id: string;
  readonly ownerUid: string;
  readonly stage: SessionRecord<T>["stage"];
  readonly documentType: SessionRecord<T>["documentType"];
  documents: SessionRecord<T>["documents"];
  readonly createdAt: number;
  expiresAt: number;
  outputs: SessionOutputs<T>;
}

export class MemorySessionStore<T extends Record<OutputKind, unknown> = Record<OutputKind, unknown>> implements SessionStore<T> {
  readonly kind = "memory";
  private readonly entries = new Map<string, Entry<T>>();
  private readonly ttlMs: number;
  private readonly maxSessions: number;
  private readonly now: () => number;
  private readonly sweepEveryMs: number;
  private sweeper: NodeJS.Timeout | null = null;

  constructor(options: MemorySessionStoreOptions) {
    checkStoreOptions(options);
    this.ttlMs = options.ttlMs;
    this.maxSessions = options.maxSessions;
    // Read Date.now at call time, not construction time, so a test that fakes the clock later is honoured.
    this.now = options.now ?? (() => Date.now());
    this.sweepEveryMs = options.sweepEveryMs ?? Math.min(options.ttlMs, 60_000);
  }

  async create(input: CreateSessionInput): Promise<SessionRecord<T>> {
    this.sweep();
    if (this.entries.size >= this.maxSessions) throw new SessionStoreFullError(this.maxSessions);
    const now = this.now();
    const entry: Entry<T> = {
      id: randomUUID(),
      ownerUid: input.ownerUid,
      stage: input.stage,
      documentType: input.documentType,
      documents: [...input.documents],
      createdAt: now,
      expiresAt: now + this.ttlMs,
      outputs: {},
    };
    this.entries.set(entry.id, entry);
    this.startSweeper();
    return snapshot(entry);
  }

  async find(id: string, ownerUid: string): Promise<SessionLookup<T>> {
    const entry = this.live(id);
    if (!entry) return { outcome: "missing" };
    if (entry.ownerUid !== ownerUid) return { outcome: "foreign" };
    entry.expiresAt = this.now() + this.ttlMs;
    return { outcome: "found", session: snapshot(entry) };
  }

  async has(id: string): Promise<boolean> {
    return this.live(id) !== undefined;
  }

  async saveOutput<K extends OutputKind>(id: string, ownerUid: string, kind: K, output: T[K]): Promise<boolean> {
    const entry = this.live(id);
    if (!entry || entry.ownerUid !== ownerUid) return false;
    entry.outputs[kind] = output;
    return true;
  }

  async deleteOwned(id: string, ownerUid: string): Promise<boolean> {
    const entry = this.live(id);
    if (!entry || entry.ownerUid !== ownerUid) return false;
    this.remove(entry);
    return true;
  }

  async size(): Promise<number> {
    this.sweep();
    return this.entries.size;
  }

  async close(): Promise<void> {
    for (const entry of [...this.entries.values()]) this.remove(entry);
    this.stopSweeper();
  }

  /** The entry if it exists and has not expired; an expired one is removed on the way. Does not touch the expiry. */
  private live(id: string): Entry<T> | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.remove(entry);
      return undefined;
    }
    return entry;
  }

  /** Deletes every expired session; returns how many went. */
  sweep(): number {
    const now = this.now();
    let removed = 0;
    for (const entry of this.entries.values()) {
      if (entry.expiresAt <= now) {
        this.remove(entry);
        removed += 1;
      }
    }
    return removed;
  }

  private remove(entry: Entry<T>): void {
    this.entries.delete(entry.id);
    // Emptied, not just dropped: a snapshot handed out earlier shares nothing with the entry, but the entry itself may still be referenced.
    entry.documents = [];
    for (const kind of OUTPUT_KINDS) delete entry.outputs[kind];
    if (this.entries.size === 0) this.stopSweeper();
  }

  private startSweeper(): void {
    if (this.sweeper) return;
    this.sweeper = setInterval(() => this.sweep(), this.sweepEveryMs);
    this.sweeper.unref();
  }

  private stopSweeper(): void {
    if (!this.sweeper) return;
    clearInterval(this.sweeper);
    this.sweeper = null;
  }
}

/** A copy for the caller: the document list and the outputs map are the caller's own, the documents themselves are shared (they are never mutated). */
function snapshot<T extends Record<OutputKind, unknown>>(entry: Entry<T>): SessionRecord<T> {
  return {
    id: entry.id,
    ownerUid: entry.ownerUid,
    stage: entry.stage,
    documentType: entry.documentType,
    documents: [...entry.documents],
    createdAt: entry.createdAt,
    expiresAt: entry.expiresAt,
    outputs: { ...entry.outputs },
  };
}
