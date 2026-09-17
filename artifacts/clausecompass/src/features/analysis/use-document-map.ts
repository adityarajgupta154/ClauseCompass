import { useMemo } from "react";
import { prepareDocumentMap, type DocumentMapResponse } from "@workspace/api-client-react";
import { sessionQueryKey } from "@/features/journey/journey-context";
import { inSession, useAnalysisRequest, type AnalysisState } from "./use-analysis-request";

export type DocumentMapState = AnalysisState<DocumentMapResponse>;

const request = inSession(prepareDocumentMap);

/** The Document Map of the session's document (FR-04, FR-05); see useAnalysisRequest for the lifecycle. */
export function useDocumentMap(sessionId: string): DocumentMapState & { retry: () => void } {
  const input = useMemo(() => ({ sessionId }), [sessionId]);
  return useAnalysisRequest([...sessionQueryKey(sessionId), "document-map"], request, input);
}
