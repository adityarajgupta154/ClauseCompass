import { useMemo } from "react";
import { prepareComparison, type CompareResponse } from "@workspace/api-client-react";
import { sessionQueryKey } from "@/features/journey/journey-context";
import { inSession, useAnalysisRequest, type AnalysisState } from "./use-analysis-request";

export type CompareState = AnalysisState<CompareResponse>;

const request = inSession(prepareComparison);

/** The two-version comparison of a compare session (FR-07); see useAnalysisRequest for the lifecycle. */
export function useCompare(sessionId: string): CompareState & { retry: () => void } {
  const input = useMemo(() => ({ sessionId }), [sessionId]);
  return useAnalysisRequest([...sessionQueryKey(sessionId), "compare"], request, input);
}
