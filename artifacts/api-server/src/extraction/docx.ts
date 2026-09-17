import mammoth from "mammoth";
import { ExtractionError } from "./errors";
import { MAX_DOCX_ENTRIES, MAX_DOCX_UNPACKED_BYTES } from "./limits";
import { splitParagraphs, toChunks } from "./paragraphs";
import type { ExtractedChunk } from "./types";
import { measureZip } from "./zip";

/**
 * DOCX: mammoth's raw-text output separates Word paragraphs with a blank
 * line, so the same blank-line split as TXT applies. Word files have no fixed
 * pagination (it depends on the renderer), so `page` is null; the paragraph
 * index is the only stable coordinate.
 *
 * The zip is measured first, under a budget: a file that expands past it
 * (a decompression bomb) is refused as too large before mammoth opens it,
 * and an archive that cannot be measured is refused as malformed rather than
 * handed to mammoth — its zip reader is more lenient, and that leniency is
 * what a hostile file would aim for. Anything mammoth then throws (a missing
 * document part, unreadable XML) is reported as `malformed` too; sniffing
 * has already handled the not-a-zip and password-protected (OLE) cases.
 */
export async function extractDocx(bytes: Uint8Array): Promise<ExtractedChunk[]> {
  const measure = measureZip(bytes, { maxEntries: MAX_DOCX_ENTRIES, maxUnpackedBytes: MAX_DOCX_UNPACKED_BYTES });
  if (measure.result === "over") throw new ExtractionError("too-large", { kind: "docx", unpacked: true });
  if (measure.result === "unreadable") throw new ExtractionError("malformed", { kind: "docx", cause: new Error("zip structure could not be measured") });

  let text: string;
  try {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    text = result.value;
  } catch (cause) {
    throw new ExtractionError("malformed", { kind: "docx", cause });
  }
  return toChunks([{ page: null, paragraphs: splitParagraphs(text) }]);
}
