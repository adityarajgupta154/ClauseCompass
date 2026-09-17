import type { DocumentTypeId, StageId } from "@workspace/rules";
import type { ExtractedDocument } from "../extraction";

/**
 * The session store (FR-12, PRD §9): a reader's uploaded document(s), as
 * extracted paragraphs, plus the outputs prepared from them, held for a
 * short time and gone the moment the reader asks.
 *
 * This file is the contract; two stores keep it:
 *
 * - memory-store.ts holds sessions in this process. One process, one store:
 *   right for local runs, the tests, and any host that runs the API as a
 *   single instance.
 * - redis-store.ts holds them in a Redis database, reached over Upstash's
 *   REST API (upstash-rest.ts) or over a socket (redis-socket.ts), so every
 *   instance of the API sees the same sessions. For hosts that start an
 *   instance per request. Each value is sealed (compressed, then encrypted
 *   under a key only the API holds) before it leaves the process.
 *
 * What both promise:
 *
 * - A session is created from already-extracted documents; the uploaded
 *   bytes are never handed to the store, so they exist only for the length of
 *   the upload request.
 * - The TTL slides: every request the owner makes that finds the session
 *   moves its expiry to now + ttl. That is the promise the pre-upload notice
 *   makes ("deleted automatically after N minutes without activity"). Nobody
 *   else's request moves it: a lookup that is going to be refused must not
 *   keep another reader's document retained.
 * - Delete is immediate and idempotent, and only the owner's delete counts.
 * - A session is never returned after it expired, however it is looked up.
 * - Every method is asynchronous, whatever the store behind it, so the
 *   routes are written once.
 *
 * What neither promises: a preparation in flight is per process (see
 * in-flight.ts); a store holds finished outputs only.
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

/**
 * A session as a store hands it out: a snapshot at the time of the lookup,
 * not a live object. Whoever holds one learns nothing further about the
 * session from it; a later request looks it up again.
 */
export interface SessionRecord<T extends Record<OutputKind, unknown> = Record<OutputKind, unknown>> {
  readonly id: string;
  /** The signed-in reader who opened it (auth/verifier.ts); the routes show the session to nobody else. */
  readonly ownerUid: string;
  readonly stage: StageId;
  readonly documentType: DocumentTypeId | undefined;
  readonly documents: readonly SessionDocument[];
  /** Epoch ms. */
  readonly createdAt: number;
  /** Epoch ms, as of this lookup; the next one moves it forward again. */
  readonly expiresAt: number;
  readonly outputs: Readonly<SessionOutputs<T>>;
}

export interface CreateSessionInput {
  ownerUid: string;
  stage: StageId;
  documentType?: DocumentTypeId;
  documents: SessionDocument[];
}

/**
 * The answer to an owner's lookup. "foreign" (a live session that belongs to
 * somebody else) exists so the route can log the attempt; the reader is
 * answered exactly as for "missing", and the session is not touched.
 */
export type SessionLookup<T extends Record<OutputKind, unknown>> =
  | { outcome: "found"; session: SessionRecord<T> }
  | { outcome: "missing" }
  | { outcome: "foreign" };

export interface SessionStoreOptions {
  /** Inactivity after which a session is deleted, in ms. */
  ttlMs: number;
  /** Live sessions the store accepts before refusing new ones. */
  maxSessions: number;
  /** Clock in epoch ms; defaults to Date.now. */
  now?: () => number;
}

export interface SessionStore<T extends Record<OutputKind, unknown> = Record<OutputKind, unknown>> {
  /** "memory" or "redis"; logged at boot, shown nowhere else. */
  readonly kind: string;
  /** Opens a session; rejects with SessionStoreFullError at capacity. */
  create(input: CreateSessionInput): Promise<SessionRecord<T>>;
  /** The live session if this reader opened it, its expiry moved forward; see SessionLookup for the other answers. */
  find(id: string, ownerUid: string): Promise<SessionLookup<T>>;
  /** Whether a live session with this id exists. Nothing is touched. */
  has(id: string): Promise<boolean>;
  /** Keeps a prepared output with the session for the reader who opened it; false, and nothing kept, when the session is gone. Does not move the expiry. */
  saveOutput<K extends OutputKind>(id: string, ownerUid: string, kind: K, output: T[K]): Promise<boolean>;
  /** Removes the session if this reader opened it; true if it did. Somebody else's session is left exactly as it was, expiry included. */
  deleteOwned(id: string, ownerUid: string): Promise<boolean>;
  /** Live sessions held, as best the store can tell. */
  size(): Promise<number>;
  /** Releases what the store holds in this process; for shutdown and tests. */
  close(): Promise<void>;
}

/** Thrown by create() when the store is at capacity; the route turns it into a 503. */
export class SessionStoreFullError extends Error {
  constructor(readonly maxSessions: number) {
    super(`the session store holds its maximum of ${maxSessions} sessions`);
    this.name = "SessionStoreFullError";
  }
}

/** Thrown when the store cannot be reached or did not answer as a store should; the route turns it into a 503. */
export class SessionStoreUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SessionStoreUnavailableError";
  }
}

export function checkStoreOptions(options: SessionStoreOptions): void {
  if (!Number.isFinite(options.ttlMs) || options.ttlMs <= 0) throw new RangeError("ttlMs must be a positive number");
  if (!Number.isInteger(options.maxSessions) || options.maxSessions <= 0) throw new RangeError("maxSessions must be a positive integer");
}
