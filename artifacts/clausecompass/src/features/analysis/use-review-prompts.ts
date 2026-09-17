import { useMemo } from "react";
import { prepareReviewPrompts, type ReviewPromptsResponse } from "@workspace/api-client-react";
import { sessionQueryKey } from "@/features/journey/journey-context";
import { inSession, useAnalysisRequest, type AnalysisState } from "./use-analysis-request";

export type ReviewPromptsState = AnalysisState<ReviewPromptsResponse>;

const request = inSession(prepareReviewPrompts);

/** The Review Prompts of the session's document (FR-06); see useAnalysisRequest for the lifecycle. */
export function useReviewPrompts(sessionId: string): ReviewPromptsState & { retry: () => void } {
  const input = useMemo(() => ({ sessionId }), [sessionId]);
  return useAnalysisRequest([...sessionQueryKey(sessionId), "review-prompts"], request, input);
}
