import type { PrepareComparisonResponse, PrepareDocumentMapResponse, PrepareReviewPromptsResponse } from "@workspace/api-zod";
import type { z } from "zod";
import { getConfig, type Config } from "../lib/config";
import { logger } from "../lib/logger";
import { InFlight } from "./in-flight";
import { MemorySessionStore } from "./memory-store";
import { RedisSocket } from "./redis-socket";
import { RedisSessionStore } from "./redis-store";
import { SealedCodec } from "./sealed";
import type { SessionRecord, SessionStore } from "./store";
import { UpstashRest, type RedisCommands } from "./upstash-rest";

export {
  OUTPUT_KINDS,
  SessionStoreFullError,
  SessionStoreUnavailableError,
  SLOT_IDS,
  type CreateSessionInput,
  type OutputKind,
  type SessionDocument,
  type SessionLookup,
  type SessionRecord,
  type SessionStore,
  type SessionStoreOptions,
  type SlotId,
} from "./store";
export { InFlight } from "./in-flight";
export { MemorySessionStore } from "./memory-store";
export { RedisSessionStore } from "./redis-store";

/** What a session holds once prepared: the exact (validated) response bodies, so a repeat request is a lookup. */
export interface PreparedOutputs {
  documentMap: z.infer<typeof PrepareDocumentMapResponse>;
  reviewPrompts: z.infer<typeof PrepareReviewPromptsResponse>;
  compare: z.infer<typeof PrepareComparisonResponse>;
}

export type ApiSession = SessionRecord<PreparedOutputs>;

/**
 * Live sessions the store holds before it refuses new uploads with 503.
 * A session is at most two extracted documents (each under MAX_WORDS) plus
 * their outputs, which repeat the chunks: well under 1 MB for the largest
 * permitted document, a few KB for a typical one. 100 keeps the worst case
 * inside the memory an instance can spare while leaving room for a
 * demo-day audience; in a shared store the same number bounds the database.
 */
export const MAX_SESSIONS = 100;

/** The store the configuration asks for, sized from SESSION_TTL_MINUTES. */
export function createSessionStore(config: Config): SessionStore<PreparedOutputs> {
  const ttlMs = config.sessionTtlMinutes * 60_000;
  const { sessionStore } = config;
  if (sessionStore.kind === "memory") {
    return new MemorySessionStore<PreparedOutputs>({ ttlMs, maxSessions: MAX_SESSIONS });
  }
  const { access } = sessionStore;
  const redis: RedisCommands = access.transport === "rest" ? new UpstashRest({ url: access.url, token: access.token }) : new RedisSocket({ url: access.url });
  return new RedisSessionStore<PreparedOutputs>({
    ttlMs,
    maxSessions: MAX_SESSIONS,
    redis,
    codec: new SealedCodec(sessionStore.key),
    onUnreadable: (error) => logger.warn({ err: error }, "a session's stored values could not be opened; the session was dropped (SESSION_STORE_KEY changed?)"),
  });
}

let cachedStore: SessionStore<PreparedOutputs> | undefined;
let cachedInFlight: InFlight<PreparedOutputs> | undefined;

/** The process-wide store. */
export function getSessionStore(): SessionStore<PreparedOutputs> {
  cachedStore ??= createSessionStore(getConfig());
  return cachedStore;
}

/** The process-wide registry of preparations in flight. */
export function getInFlight(): InFlight<PreparedOutputs> {
  cachedInFlight ??= new InFlight<PreparedOutputs>();
  return cachedInFlight;
}
