import { randomUUID } from "node:crypto";
import type { DocumentTypeId, StageId } from "@workspace/rules";
import type { ExtractedDocument } from "../extraction";

/**
 * The session store (FR-12, PRD §9): a reader's uploaded document(s), as
 * extracted paragraphs, plus the outputs prepared from them, held in this
 * process's memory for a short time and gone the moment the reader asks.
 *
 * - A session is created from already-extracted documents; the uploaded
 *   bytes are never handed to the store, so they exist only for the length of
 *   the upload request.
 * - The TTL slides: every request that touches the session (read or prepare)
 *   moves its expiry to now + ttl. That is the promise the pre-upload notice
 *   makes ("deleted automatically after N minutes without activity").
 * - Delete is immediate and idempotent: the entry leaves the map, every
 *   in-flight preparation is aborted through the session's signal, and the
 *   session object is emptied so nothing about the document stays reachable
 *   through a reference some request still holds.
 * - Expiry is checked on every read and by a sweep that runs while the store
 *   is non-empty; the timer is unref'd so it never keeps the process alive.
 * - The clock is injectable so the tests can move time instead of waiting.
 *
 * One process, one store: sessions are not shared between instances, so the
 * API must run as a single instance (see replit.md).
 */

export const SLOT_IDS = ["primary", "older", "newer"] as const;
export type SlotId = (typeof SLOT_IDS)[number];

export interface SessionDocument {
  slot: SlotId;
  /** The uploaded file's name as the session shows it (uploads/file-name.ts: checked, cleaned, capped). */
  name: string;
  document: ExtractedDocument;
}

export const OUTPUT_KINDS = ["documentMap", "reviewPrompts", "compare"] as const;
export type OutputKind = (typeof OUTPUT_KINDS)[number];

/** The prepared outputs, typed by whoever prepares them; the store only holds and drops them. */
export type SessionOutputs<T extends Record<OutputKind, unknown>> = Partial<T>;

export interface Session<T extends Record<OutputKind, unknown> = Record<OutputKind, unknown>> {
  readonly id: string;
  /** The signed-in reader who opened it (auth/verifier.ts); the routes show the session to nobody else. */
  readonly ownerUid: string;
  readonly stage: StageId;
  readonly documentType: DocumentTypeId | undefined;
  /** Emptied on delete. */
  readonly documents: SessionDocument[];
  readonly createdAt: number;
  /** Epoch ms; moved forward by every touch. */
  expiresAt: number;
  /** Cleared on delete. */
  readonly outputs: SessionOutputs<T>;
  /** Preparations in flight, so concurrent requests for one output share a single run. Cleared on delete. */
  readonly pending: Partial<{ [K in OutputKind]: Promise<T[K]> }>;
  /** Aborted when the session is deleted or expires; every model call for the session runs under it. */
  readonly signal: AbortSignal;
  /** True once deleted (explicitly or by expiry); a request that still holds the object must treat it as gone. */
  deleted: boolean;
}

export interface CreateSessionInput {
  ownerUid: string;
  stage: StageId;
  documentType?: DocumentTypeId;
  documents: SessionDocument[];
}

export interface SessionStoreOptions {
  /** Inactivity after which a session is deleted, in ms. */
  ttlMs: number;
  /** Live sessions the store accepts before refusing new ones. */
  maxSessions: number;
  /** Clock in epoch ms; defaults to Date.now. */
  now?: () => number;
  /** How often the sweep runs while sessions exist; defaults to min(ttl, 60 s). */
  sweepEveryMs?: number;
}

/** Thrown by create() when the store is at capacity; the route turns it into a 503. */
export class SessionStoreFullError extends Error {
  constructor(readonly maxSessions: number) {
    super(`the session store holds its maximum of ${maxSessions} sessions`);
    this.name = "SessionStoreFullError";
  }
}

interface Entry<T extends Record<OutputKind, unknown>> {
  session: Session<T>;
  controller: AbortController;
}

export class SessionStore<T extends Record<OutputKind, unknown> = Record<OutputKind, unknown>> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly ttlMs: number;
  private readonly maxSessions: number;
  private readonly now: () => number;
  private readonly sweepEveryMs: number;
  private sweeper: NodeJS.Timeout | null = null;

  constructor(options: SessionStoreOptions) {
    if (!Number.isFinite(options.ttlMs) || options.ttlMs <= 0) throw new RangeError("ttlMs must be a positive number");
    if (!Number.isInteger(options.maxSessions) || options.maxSessions <= 0) throw new RangeError("maxSessions must be a positive integer");
    this.ttlMs = options.ttlMs;
    this.maxSessions = options.maxSessions;
    // Read Date.now at call time, not construction time, so a test that fakes the clock later is honoured.
    this.now = options.now ?? (() => Date.now());
    this.sweepEveryMs = options.sweepEveryMs ?? Math.min(options.ttlMs, 60_000);
  }

  get size(): number {
    return this.entries.size;
  }

  create(input: CreateSessionInput): Session<T> {
    this.sweep();
    if (this.entries.size >= this.maxSessions) throw new SessionStoreFullError(this.maxSessions);
    const controller = new AbortController();
    const now = this.now();
    const session: Session<T> = {
      id: randomUUID(),
      ownerUid: input.ownerUid,
      stage: input.stage,
      documentType: input.documentType,
      documents: [...input.documents],
      createdAt: now,
      expiresAt: now + this.ttlMs,
      outputs: {},
      pending: {},
      signal: controller.signal,
      deleted: false,
    };
    this.entries.set(session.id, { session, controller });
    this.startSweeper();
    return session;
  }

  /** The live session, its expiry moved forward; undefined if unknown, deleted or expired. */
  get(id: string): Session<T> | undefined {
    const entry = this.live(id);
    if (!entry) return undefined;
    entry.session.expiresAt = this.now() + this.ttlMs;
    return entry.session;
  }

  /**
   * The live session if this reader opened it, its expiry moved forward;
   * undefined if unknown, deleted, expired, or somebody else's. Only the
   * owner's touch moves the clock: a request that is going to be refused
   * must not keep another reader's document retained.
   */
  getOwned(id: string, ownerUid: string): Session<T> | undefined {
    const entry = this.live(id);
    if (!entry || entry.session.ownerUid !== ownerUid) return undefined;
    entry.session.expiresAt = this.now() + this.ttlMs;
    return entry.session;
  }

  /** Whether a live session with this id exists and belongs to somebody else; nothing is touched. For the log line only. */
  isSomeoneElses(id: string, ownerUid: string): boolean {
    const entry = this.live(id);
    return entry !== undefined && entry.session.ownerUid !== ownerUid;
  }

  /** Removes the session and everything in it; true if it existed. */
  delete(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    this.remove(entry);
    return true;
  }

  /** Removes the session if this reader opened it; true if it did. Somebody else's session is left exactly as it was, expiry included. */
  deleteOwned(id: string, ownerUid: string): boolean {
    const entry = this.live(id);
    if (!entry || entry.session.ownerUid !== ownerUid) return false;
    this.remove(entry);
    return true;
  }

  /** The entry if it exists and has not expired; an expired one is removed on the way. Does not touch the expiry. */
  private live(id: string): Entry<T> | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    if (entry.session.expiresAt <= this.now()) {
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
      if (entry.session.expiresAt <= now) {
        this.remove(entry);
        removed += 1;
      }
    }
    return removed;
  }

  /** Deletes every session and stops the sweep; for shutdown and tests. */
  close(): void {
    for (const entry of [...this.entries.values()]) this.remove(entry);
    this.stopSweeper();
  }

  private remove(entry: Entry<T>): void {
    const { session } = entry;
    this.entries.delete(session.id);
    session.deleted = true;
    entry.controller.abort(new Error("session deleted"));
    session.documents.length = 0;
    for (const kind of OUTPUT_KINDS) {
      delete session.outputs[kind];
      delete session.pending[kind];
    }
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
