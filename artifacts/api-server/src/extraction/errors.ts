import { MAX_FILE_LABEL, MAX_PAGES } from "./limits";
import type { DocumentKind } from "./types";

/**
 * Every way extraction can refuse a file. Each code carries an HTTP status and
 * a message written for the person who uploaded the file. The message is the
 * only text that ever reaches the client: parser exceptions stay on the
 * server as `cause`, so a stack trace or a library message can never leak.
 */
export type ExtractionErrorCode =
  | "unsupported-format"
  | "format-mismatch"
  | "encrypted"
  | "malformed"
  | "empty"
  | "no-text"
  | "too-large"
  | "too-long"
  | "too-complex";

const STATUS: Record<ExtractionErrorCode, number> = {
  "unsupported-format": 415,
  "format-mismatch": 415,
  encrypted: 422,
  malformed: 422,
  empty: 422,
  "no-text": 422,
  "too-large": 413,
  "too-long": 413,
  "too-complex": 422,
};

const KIND_LABEL: Record<DocumentKind, string> = {
  pdf: "a PDF",
  docx: "a Word (.docx) file",
  txt: "a plain-text (.txt) file",
};

export interface ExtractionErrorContext {
  /** The kind the file claimed to be (by extension or MIME type). */
  kind?: DocumentKind;
  /** Which cap was exceeded, for `too-long`. */
  cap?: "pages" | "words";
  /** For `too-large`: the file itself is small but expands past the limit when opened. */
  unpacked?: boolean;
  /** The underlying exception, kept server-side for logs. */
  cause?: unknown;
}

function messageFor(code: ExtractionErrorCode, ctx: ExtractionErrorContext): string {
  switch (code) {
    case "unsupported-format":
      return "This file type is not supported. ClauseCompass reads PDF, Word (.docx) and plain-text (.txt) files.";
    case "format-mismatch":
      return ctx.kind
        ? `This file is named like ${KIND_LABEL[ctx.kind]}, but its contents are not, so it was not processed. If it was renamed, restore the original extension.`
        : "This file's contents do not match its type, so it was not processed.";
    case "encrypted":
      return ctx.kind === "docx"
        ? "This file is either password-protected or in the older .doc format, which cannot be opened. Save it as .docx or export it as a PDF, then try again."
        : "This PDF is password-protected and cannot be opened. Remove the password or export an unprotected copy, then try again.";
    case "malformed":
      return "This file could not be read; it may be damaged or incomplete. Export it again from the application it came from and try once more.";
    case "empty":
      return "This file is empty (0 bytes), so there is nothing to read. Check that the document was saved completely, then choose it again.";
    case "no-text":
      return "No readable text was found in this file. Scanned or photographed documents are not supported yet; a PDF, DOCX or TXT with selectable text is needed.";
    case "too-large":
      return ctx.unpacked
        ? `This file expands to far more than ${MAX_FILE_LABEL} when opened, so it was not processed. Export a plain copy without embedded media and try again.`
        : `This file is larger than ${MAX_FILE_LABEL}, the maximum for one document.`;
    case "too-long":
      return ctx.cap === "words"
        ? `This document is longer than the limit for one document (about ${MAX_PAGES} pages of text).`
        : `This document has more than ${MAX_PAGES} pages, the maximum for one document.`;
    case "too-complex":
      return "This file could not be read within the time and memory allowed for one document. It may be damaged or unusually complex; export a simpler copy (for example, print it to a new PDF) and try again.";
  }
}

export class ExtractionError extends Error {
  override readonly name = "ExtractionError";
  readonly status: number;

  constructor(
    readonly code: ExtractionErrorCode,
    readonly context: ExtractionErrorContext = {},
  ) {
    super(messageFor(code, context), context.cause === undefined ? undefined : { cause: context.cause });
    this.status = STATUS[code];
  }
}

export function isExtractionError(value: unknown): value is ExtractionError {
  return value instanceof ExtractionError;
}
