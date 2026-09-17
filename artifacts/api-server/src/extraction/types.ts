/**
 * Output of the extraction step (PRD §7.2: "extract text with page/paragraph
 * coordinates"). Everything downstream (chunk ids, retrieval, citations) is
 * built on these records, so the shape is deliberately small and stable.
 */

export const DOCUMENT_KINDS = ["pdf", "docx", "txt"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export interface ExtractedChunk {
  /** Paragraph text with runs of whitespace collapsed to single spaces. */
  text: string;
  /** 1-based page number; null for formats without fixed pages (DOCX, TXT). */
  page: number | null;
  /** 1-based position of the paragraph in the whole document, across pages. */
  paragraphIndex: number;
}

export interface ExtractedDocument {
  kind: DocumentKind;
  /** Number of pages; null for formats without fixed pages. */
  pageCount: number | null;
  /** Whitespace-separated word count over all chunks. */
  wordCount: number;
  chunks: ExtractedChunk[];
}

export interface ExtractionInput {
  bytes: Uint8Array;
  /** Original file name; only its extension is used, and it is never logged. */
  filename: string;
  /** MIME type as reported by the uploader; consulted only when the name has no extension. */
  mimeType?: string;
}
