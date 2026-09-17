import type { DocumentMapResponse, ReviewPromptsResponse } from "@workspace/api-client-react";
import { useDocumentMap } from "@/features/analysis/use-document-map";
import { useReviewPrompts } from "@/features/analysis/use-review-prompts";
import type { AnalysisState } from "@/features/analysis/use-analysis-request";

export interface PacketData {
  map: DocumentMapResponse;
  review: ReviewPromptsResponse;
}

export type PacketState = AnalysisState<PacketData> & { retry: () => void };

/**
 * The two outputs the packet is built from, as one state. Each is the same
 * request the map and the review screens make, so a reader who has seen
 * those screens gets the packet from memory; one who comes straight here
 * has both prepared at once. An error in either is the packet's error, and
 * retry re-asks only for what failed.
 */
export function usePacket(sessionId: string): PacketState {
  const map = useDocumentMap(sessionId);
  const review = useReviewPrompts(sessionId);
  const retry = () => {
    if (map.status === "error") map.retry();
    if (review.status === "error") review.retry();
  };
  if (map.status === "ready" && review.status === "ready") {
    return { status: "ready", data: { map: map.data, review: review.data }, retry };
  }
  if (map.status === "error") return { status: "error", error: map.error, retry };
  if (review.status === "error") return { status: "error", error: review.error, retry };
  return { status: "analysing", retry };
}
