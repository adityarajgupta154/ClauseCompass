/**
 * What an uploaded file may be called (PRD §9: file-upload hardening). The
 * name is data the client chose: it decides which format the file claims to
 * be (by its extension) and it is shown back in a session, and that is all
 * it is ever used for — nothing is written to disk under it. Still, a name
 * that looks like a path or carries control characters only comes from a
 * crafted request (browsers and curl send a bare base name), so it is
 * refused outright rather than quietly repaired, and the response says so.
 */

/** Length of the name a session keeps and shows. */
export const MAX_FILE_NAME_CHARS = 120;
/** Longer than any file system allows for one name; only a crafted request sends it. */
export const MAX_RAW_FILE_NAME_CHARS = 255;

export type FileNameProblem = "path" | "control" | "too-long" | "empty";

const SEPARATOR = /[\\/]/;
/** C0 and C1 control characters, NUL included (multer decodes %0A/%0D back into a name; a tab passes the multipart parser as it is). */
const CONTROL = /\p{Cc}/u;
const CONTROL_ALL = /\p{Cc}/gu;
/**
 * Invisible direction and layout controls: a right-to-left override in
 * `lease<RLO>txt.pdf` makes it read as `leasefdp.txt` on screen. They have no
 * place in a file name and are dropped. The zero-width joiner and non-joiner
 * (U+200C, U+200D) are kept on purpose: Indic scripts use them to shape
 * conjuncts, so a Devanagari name may legitimately contain them.
 */
const LAYOUT_CONTROLS = /[\u061c\u200b\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/gu;
/** An extension worth preserving when a long name is cut: a dot followed by up to ten letters or digits at the end. */
const EXTENSION = /\.[a-z0-9]{1,10}$/i;

/**
 * Why a raw multipart file name is refused, or null when it may be used
 * (after `safeFileName`). Checked before the file's bytes are buffered. The
 * dot checks run on the cleaned name — the one extraction and the session
 * will see — so an invisible character cannot hide a `..` from them.
 */
export function fileNameProblem(raw: string): FileNameProblem | null {
  if (raw.length > MAX_RAW_FILE_NAME_CHARS) return "too-long";
  if (SEPARATOR.test(raw)) return "path";
  if (CONTROL.test(raw)) return "control";
  const cleaned = clean(raw);
  if (cleaned.length === 0) return "empty";
  if (cleaned === "." || cleaned === "..") return "path";
  return null;
}

/**
 * The name kept for a file that passed the check: whitespace collapsed to
 * single spaces, control and layout characters removed, capped in length
 * with the extension kept. As a second line behind `fileNameProblem`, a path
 * is reduced to its last segment and an unusable name becomes "document",
 * so the function never throws whatever it is handed.
 */
export function safeFileName(raw: string): string {
  const base = raw.split(SEPARATOR).pop() ?? "";
  const cleaned = clean(base);
  if (cleaned.length === 0) return "document";
  if (cleaned.length <= MAX_FILE_NAME_CHARS) return cleaned;
  // A cleaned name longer than the cap always has a stem: the extension is at most 11 characters.
  const extension = EXTENSION.exec(cleaned)?.[0] ?? "";
  const stem = cleaned.slice(0, cleaned.length - extension.length).slice(0, MAX_FILE_NAME_CHARS - extension.length).trimEnd();
  return `${stem}${extension}`;
}

function clean(value: string): string {
  return value.normalize("NFC").replace(LAYOUT_CONTROLS, "").replace(/\s+/g, " ").replace(CONTROL_ALL, "").trim();
}
