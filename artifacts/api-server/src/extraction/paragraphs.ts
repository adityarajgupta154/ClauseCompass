import type { ExtractedChunk } from "./types";

/**
 * Paragraph helpers shared by the three extractors. A "chunk" in this layer
 * is one paragraph: the unit the PRD's retrieval and citations work on.
 */

/** Collapses every run of whitespace (including line breaks) to one space and trims. */
export function normalizeParagraph(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Splits plain text into paragraphs on blank lines (a line containing only
 * whitespace counts as blank). Line breaks inside a paragraph are treated as
 * wrapped text and joined with spaces. Empty paragraphs are dropped.
 */
export function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t\f\v]*\n/)
    .map(normalizeParagraph)
    .filter((paragraph) => paragraph.length > 0);
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

export interface PageParagraphs {
  page: number | null;
  paragraphs: string[];
}

/** Numbers paragraphs 1..n across pages, in reading order. */
export function toChunks(pages: PageParagraphs[]): ExtractedChunk[] {
  const chunks: ExtractedChunk[] = [];
  for (const { page, paragraphs } of pages) {
    for (const text of paragraphs) {
      chunks.push({ text, page, paragraphIndex: chunks.length + 1 });
    }
  }
  return chunks;
}
