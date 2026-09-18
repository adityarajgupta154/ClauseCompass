import { randomUUID } from "node:crypto";
import type { DocumentTypeId, StageId } from "@workspace/rules";
import { SealedValueError, type SealedCodec } from "./sealed";
import {
  checkStoreOptions,
  OUTPUT_KINDS,
  SessionStoreFullError,
  SessionStoreUnavailableError,
  SLOT_IDS,
  type CreateSessionInput,
  type OutputKind,
  type SessionDocument,
  type SessionLookup,
  type SessionOutputs,
  type SessionRecord,
  type SessionStore,
  type SessionStoreOptions,
  type SlotId,
} from "./store";
import type { RedisCommands } from "./upstash-rest";

/**
 * The store that keeps sessions in a Redis database shared by every
 * instance of the API (store.ts has the contract; upstash-rest.ts carries
 * the commands).
 *
 * One hash per session, `session:<id>`, with a TTL on the key:
 *
 * - `owner`: the reader's uid, in the clear, because the ownership check
 *   runs inside Redis (a script) so that a lookup, a touch and a delete are
 *   each one atomic round trip and nobody else's request ever moves the TTL.
 * - `meta`: stage, document type and creation time, as JSON. No text.
 * - `doc:<slot>`, `out:<kind>`: the extracted document for a slot and the
 *   prepared output of a kind, each sealed (sealed.ts) with the session id,
 *   the owner's uid and the field name bound in. The database holds no
 *   readable document text, and a value does not open for any other
 *   session, field or owner: rewriting `owner` in the database to one's own
 *   uid yields a session whose values fail to open, which deletes it.
 *
 * Expiry is Redis's: PEXPIRE on create, PEXPIRE again on every owner lookup
 * (the sliding TTL), and a key past its TTL does not exist to any command.
 * Capacity is DBSIZE, counted and acted on inside the create script, so two
 * uploads cannot both pass the check; the database must be this API's own.
 *
 * A value that will not open (a sealing key that changed, a value altered
 * in the database) makes the session gone rather than an error: the key is
 * deleted, `onUnreadable` is told, and the reader is asked to upload again.
 */

const KEY_PREFIX = "session:";

const keyOf = (id: string) => `${KEY_PREFIX}${id}`;

/**
 * The scripts run inside Redis, so each check-and-act is one atomic step.
 * Exported for the test stand-in (testing/upstash-fake.ts), which recognises
 * them by text.
 */
export const REDIS_SCRIPTS = {
  /** KEYS[1] the session key, ARGV[1] the cap, ARGV[2] the ttl in ms, ARGV[3..] field, value pairs. 0: the database is full, nothing written; 1: created with its TTL. */
  create: `if redis.call('DBSIZE') >= tonumber(ARGV[1]) then return 0 end
redis.call('HSET', KEYS[1], unpack(ARGV, 3))
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return 1`,
  /** KEYS[1] the session key, ARGV[1] the reader, ARGV[2] the ttl in ms. nil: no session; 0: somebody else's, untouched; else the hash, touched. */
  find: `local owner = redis.call('HGET', KEYS[1], 'owner')
if not owner then return nil end
if owner ~= ARGV[1] then return 0 end
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return redis.call('HGETALL', KEYS[1])`,
  /** KEYS[1] the session key, ARGV[1] the field, ARGV[2] the sealed value. 1 if kept, 0 if the session is gone. The TTL is left as it is. */
  saveOutput: `if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
return 1`,
  /** KEYS[1] the session key, ARGV[1] the reader. 1 if the reader's session was deleted, 0 otherwise (nothing touched). */
  deleteOwned: `local owner = redis.call('HGET', KEYS[1], 'owner')
if not owner or owner ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[1])
return 1`,
} as const;

interface Meta {
  stage: StageId;
  documentType: DocumentTypeId | null;
  createdAt: number;
}

export interface RedisSessionStoreOptions extends SessionStoreOptions {
  redis: RedisCommands;
  codec: SealedCodec;
  /** Told when a session's values could not be opened and the session was dropped for it. */
  onUnreadable?: (error: SealedValueError) => void;
}

export class RedisSessionStore<T extends Record<OutputKind, unknown> = Record<OutputKind, unknown>> implements SessionStore<T> {
  readonly kind = "redis";
  private readonly redis: RedisCommands;
  private readonly codec: SealedCodec;
  private readonly ttlMs: number;
  private readonly maxSessions: number;
  private readonly now: () => number;
  private readonly onUnreadable: (error: SealedValueError) => void;

  constructor(options: RedisSessionStoreOptions) {
    checkStoreOptions(options);
    this.redis = options.redis;
    this.codec = options.codec;
    this.ttlMs = options.ttlMs;
    this.maxSessions = options.maxSessions;
    this.now = options.now ?? (() => Date.now());
    this.onUnreadable = options.onUnreadable ?? (() => {});
  }

  async create(input: CreateSessionInput): Promise<SessionRecord<T>> {
    const id = randomUUID();
    const now = this.now();
    const meta: Meta = { stage: input.stage, documentType: input.documentType ?? null, createdAt: now };
    const fields: string[] = ["owner", input.ownerUid, "meta", JSON.stringify(meta)];
    for (const held of input.documents) {
      fields.push(`doc:${held.slot}`, await this.codec.seal(held, sealContext(id, input.ownerUid, `doc:${held.slot}`)));
    }
    const reply = await this.redis.command(["EVAL", REDIS_SCRIPTS.create, 1, keyOf(id), this.maxSessions, this.ttlMs, ...fields]);
    if (reply === 0) throw new SessionStoreFullError(this.maxSessions);
    expectOne(reply, "create");
    return {
      id,
      ownerUid: input.ownerUid,
      stage: input.stage,
      documentType: input.documentType,
      documents: [...input.documents],
      createdAt: now,
      expiresAt: now + this.ttlMs,
      outputs: {} as SessionOutputs<T>,
    };
  }

  async find(id: string, ownerUid: string): Promise<SessionLookup<T>> {
    const reply = await this.redis.command(["EVAL", REDIS_SCRIPTS.find, 1, keyOf(id), ownerUid, this.ttlMs]);
    if (reply === null) return { outcome: "missing" };
    if (reply === 0) return { outcome: "foreign" };
    if (!Array.isArray(reply)) throw new SessionStoreUnavailableError("the session store answered a lookup in an unexpected shape");
    const expiresAt = this.now() + this.ttlMs;
    try {
      return { outcome: "found", session: await this.decode(id, ownerUid, expiresAt, hashOf(reply)) };
    } catch (error) {
      if (!(error instanceof SealedValueError)) throw error;
      await this.redis.command(["DEL", keyOf(id)]);
      this.onUnreadable(error);
      return { outcome: "missing" };
    }
  }

  async has(id: string): Promise<boolean> {
    return zeroOrOne(await this.redis.command(["EXISTS", keyOf(id)]), "EXISTS");
  }

  async saveOutput<K extends OutputKind>(id: string, ownerUid: string, kind: K, output: T[K]): Promise<boolean> {
    const sealed = await this.codec.seal(output, sealContext(id, ownerUid, `out:${kind}`));
    return zeroOrOne(await this.redis.command(["EVAL", REDIS_SCRIPTS.saveOutput, 1, keyOf(id), `out:${kind}`, sealed]), "saveOutput");
  }

  async deleteOwned(id: string, ownerUid: string): Promise<boolean> {
    return zeroOrOne(await this.redis.command(["EVAL", REDIS_SCRIPTS.deleteOwned, 1, keyOf(id), ownerUid]), "deleteOwned");
  }

  async size(): Promise<number> {
    const reply = await this.redis.command(["DBSIZE"]);
    if (typeof reply !== "number") throw new SessionStoreUnavailableError("the session store answered DBSIZE in an unexpected shape");
    return reply;
  }

  async close(): Promise<void> {
    // Nothing is held in this process beyond the client's connection, if it keeps one.
    await this.redis.close();
  }

  private async decode(id: string, ownerUid: string, expiresAt: number, hash: Map<string, string>): Promise<SessionRecord<T>> {
    const metaText = hash.get("meta");
    if (metaText === undefined) throw new SealedValueError("session has no meta field");
    let meta: Meta;
    try {
      meta = JSON.parse(metaText) as Meta;
    } catch (cause) {
      throw new SealedValueError("session meta is not JSON", { cause });
    }
    const documents: SessionDocument[] = [];
    for (const slot of SLOT_IDS) {
      const sealed = hash.get(`doc:${slot}`);
      if (sealed !== undefined) documents.push(await this.codec.open<SessionDocument>(sealed, sealContext(id, ownerUid, `doc:${slot as SlotId}`)));
    }
    const outputs: SessionOutputs<T> = {};
    for (const kind of OUTPUT_KINDS) {
      const sealed = hash.get(`out:${kind}`);
      if (sealed !== undefined) outputs[kind] = await this.codec.open<T[typeof kind]>(sealed, sealContext(id, ownerUid, `out:${kind}`));
    }
    return {
      id,
      ownerUid,
      stage: meta.stage,
      documentType: meta.documentType ?? undefined,
      documents,
      createdAt: meta.createdAt,
      expiresAt,
      outputs,
    };
  }
}

/**
 * What a sealed value is bound to: its session, its owner and its field.
 * The owner is the uid the *request* authenticated, so a value opens only
 * for the reader who wrote it, whatever the hash's `owner` field says now.
 */
function sealContext(id: string, ownerUid: string, field: string): string {
  return `${id}/${ownerUid}/${field}`;
}

/** The scripts and EXISTS answer exactly 0 or 1; anything else is not an answer, and is never read as "gone". */
function zeroOrOne(reply: unknown, what: string): boolean {
  if (reply === 1) return true;
  if (reply === 0) return false;
  throw new SessionStoreUnavailableError(`the session store answered ${what} in an unexpected shape`);
}

function expectOne(reply: unknown, what: string): void {
  if (reply !== 1) throw new SessionStoreUnavailableError(`the session store answered ${what} in an unexpected shape`);
}

/** HGETALL comes back flat: field, value, field, value. */
function hashOf(reply: unknown[]): Map<string, string> {
  const hash = new Map<string, string>();
  for (let index = 0; index + 1 < reply.length; index += 2) {
    const field = reply[index];
    const value = reply[index + 1];
    if (typeof field !== "string" || typeof value !== "string") {
      throw new SessionStoreUnavailableError("the session store answered a hash in an unexpected shape");
    }
    hash.set(field, value);
  }
  return hash;
}
