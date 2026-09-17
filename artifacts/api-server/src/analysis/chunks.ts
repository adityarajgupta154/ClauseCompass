import type { SourceChunk } from "@workspace/grounding";
import { detectClauseLabel } from "@workspace/rules";
import type { ExtractedDocument } from "../extraction";

/**
 * The bridge from extraction to the grounding contract: one SourceChunk per
 * extracted paragraph, with the id every citation in the product uses.
 *
 * Ids are `p{paragraphIndex}` — the 1-based paragraph position that the
 * extraction tests pin in samples/golden.json — so an id is stable across
 * the formats one document may arrive in (TXT, DOCX, PDF), readable in a
 * log, and checkable by hand against the fixture. Nothing else in the
 * system invents chunk ids.
 */
export function chunkId(paragraphIndex: number): string {
  return `p${paragraphIndex}`;
}

export function toSourceChunks(document: Pick<ExtractedDocument, "chunks">): SourceChunk[] {
  return document.chunks.map((chunk) => ({
    id: chunkId(chunk.paragraphIndex),
    text: chunk.text,
    location: {
      page: chunk.page,
      paragraph: chunk.paragraphIndex,
      clause: detectClauseLabel(chunk.text)?.label ?? null,
    },
  }));
}
