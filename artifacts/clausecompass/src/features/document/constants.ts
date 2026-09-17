/**
 * Client-side upload limits (PRD FR-01). The server re-checks all of these
 * plus magic bytes and the page cap; the client checks exist so a bad file is
 * refused before any upload attempt, with a message instead of a crash.
 *
 * The byte cap is the format's 10 MB unless the build says otherwise:
 * VITE_UPLOAD_MAX_MB (1–10) is set, together with the API's UPLOAD_MAX_MB,
 * on a host that accepts smaller request bodies, so the number the reader is
 * told is the number that will be enforced. Set to anything else, the build
 * is misconfigured, and the app says so rather than showing a limit that is
 * not the real one.
 *
 * Vite fills import.meta.env in the bundle and under vitest. The copy that
 * templates this label is also loaded while vite.config.ts itself loads
 * (vite/site-metadata.ts reads it for the page head), plain Node with no
 * import.meta.env; there the same variable is read from the process, so the
 * config and the bundle it produces agree on the number.
 */
export const MAX_FILE_MB = readUploadMaxMb(configuredUploadMaxMb());
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
export const MAX_FILE_LABEL = `${MAX_FILE_MB} MB`;

function configuredUploadMaxMb(): string | undefined {
  const buildEnv = import.meta.env as Record<string, string | undefined> | undefined;
  if (buildEnv !== undefined) return buildEnv.VITE_UPLOAD_MAX_MB;
  const host = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return host.process?.env?.VITE_UPLOAD_MAX_MB;
}

function readUploadMaxMb(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 10;
  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
    throw new Error(`VITE_UPLOAD_MAX_MB must be a whole number of MB from 1 to 10; the build was given "${value}"`);
  }
  return parsed;
}

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
