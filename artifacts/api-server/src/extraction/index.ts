import { extractDocx } from "./docx";
import { ExtractionError } from "./errors";
import { MAX_FILE_BYTES, MAX_WORDS } from "./limits";
import { countWords } from "./paragraphs";
import { extractPdf } from "./pdf";
import { detectKind } from "./sniff";
import { extractTxt } from "./txt";
import type { ExtractedChunk, ExtractedDocument, ExtractionInput } from "./types";

export { ExtractionError, isExtractionError, type ExtractionErrorCode } from "./errors";
export { extractDocumentIsolated } from "./isolated";
export { MAX_BUFFERED_UPLOADS, MAX_CONCURRENT_EXTRACTIONS, MAX_FILE_BYTES, MAX_PAGES, MAX_WAITING_EXTRACTIONS, MAX_WORDS } from "./limits";
export { declaredKind, detectKind } from "./sniff";
export type { DocumentKind, ExtractedChunk, ExtractedDocument, ExtractionInput } from "./types";

/**
 * Turns an uploaded file into located paragraphs. Order of checks: size
 * (empty, then over the cap), declared kind vs. magic bytes, parse, length
 * caps, emptiness of the text. Any failure is an ExtractionError with a
 * user-safe message and nothing is returned in part (PRD FR-01: "no partial
 * processing"). Nothing is stored here.
 */
export async function extractDocument(input: ExtractionInput): Promise<ExtractedDocument> {
  if (input.bytes.byteLength === 0) throw new ExtractionError("empty");
  if (input.bytes.byteLength > MAX_FILE_BYTES) throw new ExtractionError("too-large");

  const kind = detectKind(input.bytes, input.filename, input.mimeType);

  let chunks: ExtractedChunk[];
  let pageCount: number | null;
  switch (kind) {
    case "pdf": {
      const result = await extractPdf(input.bytes);
      chunks = result.chunks;
      pageCount = result.pageCount;
      break;
    }
    case "docx":
      chunks = await extractDocx(input.bytes);
      pageCount = null;
      break;
    case "txt":
      chunks = extractTxt(input.bytes);
      pageCount = null;
      break;
  }

  const wordCount = chunks.reduce((sum, chunk) => sum + countWords(chunk.text), 0);
  if (wordCount > MAX_WORDS) throw new ExtractionError("too-long", { kind, cap: "words" });
  if (chunks.length === 0) throw new ExtractionError("no-text", { kind });

  return { kind, pageCount, wordCount, chunks };
}
