/**
 * Document limits (PRD FR-01: PDF/DOCX/TXT, ≤10 MB, ≤50 pages). The client
 * pre-checks size and type with the same numbers
 * (artifacts/clausecompass/src/features/document/constants.ts); the server
 * check is the one that counts.
 */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILE_LABEL = "10 MB";

export const MAX_PAGES = 50;

/**
 * Word cap for every format. It is the page cap expressed for formats that
 * have no pages (DOCX, TXT): 50 dense pages of a contract come to roughly
 * 30,000 words. It also bounds what a later model call can be asked to read.
 */
export const MAX_WORDS = 30_000;

/**
 * Early exit while reading a PDF page by page: once this many non-whitespace
 * characters have been seen the document is over the word cap whatever the
 * remaining pages hold, so they are not read (bounds the work a padded or
 * hostile file can cause).
 */
export const MAX_CHARACTERS = 250_000;

/**
 * A .docx is a zip. Before it is opened, every entry is inflated under this
 * budget (see zip.ts), so a small archive that expands to gigabytes ("zip
 * bomb") is refused at the budget. Real contracts unpack to a few MB; a file
 * under the 10 MB cap that is mostly images stays well under this.
 */
export const MAX_DOCX_UNPACKED_BYTES = 50 * 1024 * 1024;
export const MAX_DOCX_ENTRIES = 5_000;

/**
 * Parsing runs in a worker thread per document with its own heap cap and a
 * time limit, so a hostile file can only take its own worker down. These
 * bound how many run at once and how many more may wait; beyond that the
 * request is answered 503 rather than queued without bound.
 */
export const MAX_CONCURRENT_EXTRACTIONS = 2;
export const MAX_WAITING_EXTRACTIONS = 16;
export const EXTRACTION_TIMEOUT_MS = 30_000;
export const EXTRACTION_HEAP_MB = 256;

/**
 * How many uploads may be buffering in memory at once (each up to
 * MAX_FILE_BYTES). Admission happens before the body is read, so beyond this
 * the request is answered 503 with nothing buffered; the server's request
 * timeout bounds how long a slow upload can hold its place.
 */
export const MAX_BUFFERED_UPLOADS = 32;

/**
 * Worker heap caps do not cover typed-array memory (what decoders allocate),
 * so the process's own resident size is watched while workers run: past this
 * share of the memory available to the process, running workers are stopped.
 */
export const MEMORY_PRESSURE_SHARE = 0.75;
export const MEMORY_WATCH_INTERVAL_MS = 200;

/**
 * Fewer non-whitespace characters than this across a whole PDF means there is
 * no usable text layer (a scan, or an image-only export); a page number or a
 * stray header alone must not pass as "readable".
 */
export const MIN_TEXT_CHARACTERS = 40;
