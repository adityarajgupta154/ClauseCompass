import { copy } from "@/features/journey/copy";

/**
 * What to tell the reader when the analysis request fails. The API writes
 * its refusals (4xx) and its "model unavailable" (503) messages for the
 * person who uploaded the file, so those are shown as they are. Anything
 * else — a network failure, a crash, an unexpected body — gets the generic
 * sentence rather than a status code or a stack.
 */

interface ApiFailure {
  status: number;
  data: { error: { code?: string; message: string } } | null;
}

function isApiFailure(error: unknown): error is ApiFailure {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { status?: unknown; data?: unknown };
  if (typeof candidate.status !== "number") return false;
  if (candidate.data === null || candidate.data === undefined) return true;
  const data = candidate.data as { error?: { message?: unknown } };
  return typeof data === "object" && typeof data.error?.message === "string";
}

const SHOW_SERVER_MESSAGE = (status: number) => (status >= 400 && status < 500) || status === 503;

export function describeAnalysisError(error: unknown): string {
  if (isApiFailure(error)) {
    const message = error.data?.error.message;
    if (message && SHOW_SERVER_MESSAGE(error.status)) return message;
    return copy.analysis.errors.generic;
  }
  // fetch() rejects with a TypeError when the request never reached a server.
  if (error instanceof TypeError) return copy.analysis.errors.offline;
  return copy.analysis.errors.generic;
}

/**
 * The API's answer for a session that no longer exists: it expired, or the
 * reader deleted it (here or in another tab). There is nothing to retry;
 * the way forward is to upload again.
 */
export function isSessionGone(error: unknown): boolean {
  return isApiFailure(error) && error.status === 404 && error.data?.error.code === "session-not-found";
}
