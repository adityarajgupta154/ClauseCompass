/**
 * Client-side upload limits (PRD FR-01). The server re-checks all of these
 * plus magic bytes and the page cap; the client checks exist so a bad file is
 * refused before any upload attempt, with a message instead of a crash.
 */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILE_LABEL = "10 MB";

export const ACCEPTED_KINDS = ["pdf", "docx", "txt"] as const;
export type AcceptedKind = (typeof ACCEPTED_KINDS)[number];

/** MIME types browsers report for the accepted kinds; used only when the name has no extension. */
export const MIME_TO_KIND: Record<string, AcceptedKind> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
};

/** Value for the file input's accept attribute. */
export const ACCEPT_ATTRIBUTE = [
  ".pdf",
  ".docx",
  ".txt",
  ...Object.keys(MIME_TO_KIND),
].join(",");

/** Extensions that mean "this is a scan or photo", which gets its own guidance. */
export const IMAGE_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "heic", "heif", "webp", "gif", "bmp", "tif", "tiff",
]);
