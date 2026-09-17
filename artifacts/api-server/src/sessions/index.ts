import type { PrepareComparisonResponse, PrepareDocumentMapResponse, PrepareReviewPromptsResponse } from "@workspace/api-zod";
import type { z } from "zod";
import { getConfig } from "../lib/config";
import { SessionStore, type Session } from "./store";

export {
  OUTPUT_KINDS,
  SessionStore,
  SessionStoreFullError,
  SLOT_IDS,
  type CreateSessionInput,
  type OutputKind,
  type Session,
  type SessionDocument,
  type SessionStoreOptions,
  type SlotId,
} from "./store";

/** What a session holds once prepared: the exact (validated) response bodies, so a repeat request is a lookup. */
export interface PreparedOutputs {
  documentMap: z.infer<typeof PrepareDocumentMapResponse>;
  reviewPrompts: z.infer<typeof PrepareReviewPromptsResponse>;
  compare: z.infer<typeof PrepareComparisonResponse>;
}

export type ApiSession = Session<PreparedOutputs>;

/**
 * Live sessions this process holds before it refuses new uploads with 503.
 * A session is at most two extracted documents (each under MAX_WORDS) plus
 * their outputs, which repeat the chunks: well under 1 MB for the largest
 * permitted document, a few KB for a typical one. 100 keeps the worst case
 * inside the memory an instance can spare while leaving room for a
 * demo-day audience.
 */
export const MAX_SESSIONS = 100;

let cached: SessionStore<PreparedOutputs> | undefined;

/** The process-wide store, sized from SESSION_TTL_MINUTES. */
export function getSessionStore(): SessionStore<PreparedOutputs> {
  cached ??= new SessionStore<PreparedOutputs>({
    ttlMs: getConfig().sessionTtlMinutes * 60_000,
    maxSessions: MAX_SESSIONS,
  });
  return cached;
}
