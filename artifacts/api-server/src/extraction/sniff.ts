import { ExtractionError } from "./errors";
import type { DocumentKind } from "./types";

/**
 * Decides what a file is before any parser touches it (PRD §7.2 / §9: format
 * allowlist + magic bytes). The extension says what the file claims to be;
 * the bytes have to agree, otherwise the file is refused as a mismatch
 * rather than handed to a parser that would fail in less predictable ways.
 */

const EXTENSION_TO_KIND: Record<string, DocumentKind> = {
  pdf: "pdf",
  docx: "docx",
  txt: "txt",
};

const MIME_TO_KIND: Record<string, DocumentKind> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
};

const PDF_HEADER = Buffer.from("%PDF-", "latin1");
/** The PDF spec lets junk precede the header; readers accept it within the first 1024 bytes. */
const PDF_HEADER_WINDOW = 1024;
const ZIP_LOCAL_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const DOCX_MAIN_PART = Buffer.from("word/document.xml", "latin1");
/** OLE compound file: legacy .doc, or any Office file saved with a password. */
const OLE_HEADER = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
/** How much of a text file is inspected for binary content. */
const TEXT_SNIFF_WINDOW = 64 * 1024;

function startsWith(bytes: Buffer, prefix: Buffer): boolean {
  return bytes.length >= prefix.length && bytes.subarray(0, prefix.length).equals(prefix);
}

/** The kind a file claims to be, from its extension, else from the reported MIME type. */
export function declaredKind(filename: string, mimeType?: string): DocumentKind | undefined {
  const match = /\.([a-z0-9]+)$/i.exec(filename.trim());
  if (match) return EXTENSION_TO_KIND[match[1]!.toLowerCase()];
  if (mimeType) return MIME_TO_KIND[mimeType.split(";")[0]!.trim().toLowerCase()];
  return undefined;
}

/**
 * Returns the kind when the bytes match what the name claims; throws an
 * ExtractionError otherwise (`unsupported-format`, `format-mismatch`, or
 * `encrypted` for an OLE container offered as .docx).
 */
export function detectKind(bytes: Uint8Array, filename: string, mimeType?: string): DocumentKind {
  const kind = declaredKind(filename, mimeType);
  if (!kind) throw new ExtractionError("unsupported-format");

  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  switch (kind) {
    case "pdf": {
      const window = buf.subarray(0, PDF_HEADER_WINDOW + PDF_HEADER.length);
      if (!window.includes(PDF_HEADER)) throw new ExtractionError("format-mismatch", { kind });
      return kind;
    }
    case "docx": {
      if (startsWith(buf, OLE_HEADER)) throw new ExtractionError("encrypted", { kind });
      if (!startsWith(buf, ZIP_LOCAL_HEADER) || !buf.includes(DOCX_MAIN_PART)) {
        throw new ExtractionError("format-mismatch", { kind });
      }
      return kind;
    }
    case "txt": {
      if (startsWith(buf, PDF_HEADER) || startsWith(buf, ZIP_LOCAL_HEADER) || startsWith(buf, OLE_HEADER)) {
        throw new ExtractionError("format-mismatch", { kind });
      }
      if (looksBinary(buf.subarray(0, TEXT_SNIFF_WINDOW))) {
        throw new ExtractionError("format-mismatch", { kind });
      }
      return kind;
    }
  }
}

/**
 * NUL bytes never occur in text files, except as the padding of UTF-16, which
 * a BOM announces. Anything else with NULs is a binary renamed to .txt.
 */
function looksBinary(sample: Buffer): boolean {
  const utf16Bom =
    sample.length >= 2 &&
    ((sample[0] === 0xff && sample[1] === 0xfe) || (sample[0] === 0xfe && sample[1] === 0xff));
  if (utf16Bom) return false;
  return sample.includes(0);
}
