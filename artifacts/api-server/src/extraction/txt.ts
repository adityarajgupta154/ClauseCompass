import { splitParagraphs, toChunks } from "./paragraphs";
import type { ExtractedChunk } from "./types";

/**
 * Plain text: decode, split on blank lines. Pages do not exist for TXT, so
 * every chunk carries `page: null`.
 *
 * Decoding order: a byte-order mark wins; otherwise strict UTF-8; if that
 * fails (typically a file saved by an older Windows editor) the bytes are read
 * as Windows-1252 rather than refused, since sniffing has already ruled out
 * binary content.
 */
export function decodeText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }
  try {
    // ignoreBOM: false (the default) strips a UTF-8 BOM.
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export function extractTxt(bytes: Uint8Array): ExtractedChunk[] {
  return toChunks([{ page: null, paragraphs: splitParagraphs(decodeText(bytes)) }]);
}
