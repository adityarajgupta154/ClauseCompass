import { useQuery, type QueryKey } from "@tanstack/react-query";

export type AnalysisState<T> =
  | { status: "analysing" }
  | { status: "error"; error: unknown }
  | { status: "ready"; data: T };

export type AnalysisRequest<I, T> = (input: I, options: { signal: AbortSignal }) => Promise<T>;

/**
 * How long a prepared output stays in this browser's memory once no screen
 * is showing it. Deleting the session removes it sooner (see JourneyProvider);
 * the server's own retention is its TTL, which the upload notice states.
 */
export const ANALYSIS_CACHE_MS = 30 * 60_000;

/**
 * Asks the API to prepare one output of the session when a screen first
 * needs it, and again on demand after a failure. The server prepares each
 * output once per session and keeps it for the session's lifetime; this hook
 * keeps the response in the browser's memory too (ANALYSIS_CACHE_MS), so the
 * map, the review prompts and the packet built from them agree with each
 * other and moving between screens costs no round trip. Leaving every screen
 * that shows an in-flight request aborts it.
 *
 * `queryKey` must identify the session and the output, and `input` must be
 * memoised on its parts, or the request restarts on each render.
 */
export function useAnalysisRequest<I extends object, T>(
  queryKey: QueryKey,
  request: AnalysisRequest<I, T>,
  input: I,
): AnalysisState<T> & { retry: () => void } {
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => request(input, { signal }),
    staleTime: Infinity,
    gcTime: ANALYSIS_CACHE_MS,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const retry = () => {
    void query.refetch();
  };

  if (query.isSuccess) return { status: "ready", data: query.data, retry };
  if (query.isFetching) return { status: "analysing", retry };
  if (query.isError) return { status: "error", error: query.error, retry };
  return { status: "analysing", retry };
}

/** The input every session output shares. */
export interface SessionInput {
  sessionId: string;
}

/** Adapts a generated `prepare*(sessionId, options)` client call to the request shape above. */
export function inSession<T>(prepare: (sessionId: string, options: { signal: AbortSignal }) => Promise<T>): AnalysisRequest<SessionInput, T> {
  return (input, options) => prepare(input.sessionId, options);
}
