import { LOW_CONFIDENCE_BELOW, claimSchema, type Claim, type SourceChunk } from "@workspace/grounding";

/**
 * The client half of the grounding contract (PRD section 8): decide, from a
 * claim and the chunks it may cite, whether there is anything the UI is
 * allowed to show. Pure and synchronous so it can be unit-tested without React.
 */

/** Below this the card tells the reader to check the source wording first (the contract's floor). */
export { LOW_CONFIDENCE_BELOW };

export type ChunkIndex = ReadonlyMap<string, SourceChunk>;

export function indexChunks(chunks: readonly SourceChunk[]): ChunkIndex {
  return new Map(chunks.map((chunk) => [chunk.id, chunk]));
}

export type UngroundedReason = "no-citations" | "unresolved-citations" | "invalid-claim";

export type ResolvedClaim =
  | {
      status: "grounded";
      claim: Claim;
      /** Cited chunks that exist, in citation order, de-duplicated. Never empty. */
      excerpts: SourceChunk[];
      /** Cited ids that do not exist in the index; reported, never dropped silently. */
      unresolvedIds: string[];
      lowConfidence: boolean;
    }
  | { status: "ungrounded"; reason: UngroundedReason };

/**
 * `input` is typed as unknown on purpose: the card must hold even when the
 * object did not come through the server validator (mock data, a stale
 * client, a drifted API).
 */
export function resolveClaim(input: unknown, chunks: ChunkIndex): ResolvedClaim {
  const parsed = claimSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "ungrounded", reason: "invalid-claim" };
  }
  const claim = parsed.data;
  if (claim.source_chunk_ids.length === 0) {
    return { status: "ungrounded", reason: "no-citations" };
  }

  const excerpts: SourceChunk[] = [];
  const unresolvedIds: string[] = [];
  for (const id of new Set(claim.source_chunk_ids)) {
    const chunk = chunks.get(id);
    if (chunk) excerpts.push(chunk);
    else unresolvedIds.push(id);
  }
  if (excerpts.length === 0) {
    return { status: "ungrounded", reason: "unresolved-citations" };
  }

  return {
    status: "grounded",
    claim,
    excerpts,
    unresolvedIds,
    lowConfidence: claim.confidence < LOW_CONFIDENCE_BELOW,
  };
}
