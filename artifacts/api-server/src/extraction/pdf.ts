import type { TextItem, TextMarkedContent } from "pdfjs-dist/types/src/display/api";
import { ExtractionError } from "./errors";
import { MAX_CHARACTERS, MAX_PAGES, MIN_TEXT_CHARACTERS } from "./limits";
import { normalizeParagraph, toChunks, type PageParagraphs } from "./paragraphs";
import type { ExtractedChunk } from "./types";

/**
 * PDF: pdf.js gives positioned text runs per page; this module turns them
 * into lines, then paragraphs, keeping the page number on every paragraph.
 *
 * Paragraph boundaries in a PDF are not stored, only drawn, so they are
 * recovered from layout:
 *  - a vertical gap clearly larger than the page's usual line pitch
 *    (a blank line, or Word's "space after paragraph");
 *  - a jump upwards (a new column or text block);
 *  - a line that starts like a numbered clause ("7.1 …", "(b) …") when the
 *    line before it ended early.
 * Paragraphs that continue across a page break come out as two chunks, one
 * per page; that keeps every chunk's page exact, which citations need more
 * than they need long paragraphs.
 */

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfjsPromise: Promise<PdfJs> | undefined;

function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= importQuietly();
  return pdfjsPromise;
}

/**
 * pdf.js is loaded on first use, not at boot, and without its optional canvas
 * package (rendering support, native). Importing it in Node then prints
 * warnings about the missing canvas/DOMMatrix/Path2D polyfills, which do not
 * affect text extraction; those specific lines are dropped for the duration
 * of the import. Everything else, and everything after, passes through.
 */
async function importQuietly(): Promise<PdfJs> {
  const original = { log: console.log, warn: console.warn };
  const muted =
    (write: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      if (typeof args[0] === "string" && /^Warning: Cannot (?:load|polyfill) /.test(args[0])) return;
      write(...args);
    };
  console.log = muted(original.log);
  console.warn = muted(original.warn);
  try {
    return await import("pdfjs-dist/legacy/build/pdf.mjs");
  } finally {
    console.log = original.log;
    console.warn = original.warn;
  }
}

export interface PdfExtraction {
  pageCount: number;
  chunks: ExtractedChunk[];
}

export async function extractPdf(bytes: Uint8Array): Promise<PdfExtraction> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({
    // pdf.js takes ownership of the buffer it is given; hand it a copy.
    data: new Uint8Array(bytes),
    // Text only: no font loading, no page rendering.
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });

  try {
    let doc: Awaited<typeof task.promise>;
    try {
      doc = await task.promise;
    } catch (cause) {
      throw classifyOpenFailure(cause);
    }

    if (doc.numPages > MAX_PAGES) {
      throw new ExtractionError("too-long", { kind: "pdf", cap: "pages" });
    }

    // Lines first for every page, paragraphs after: a page's paragraph breaks can depend on the line pitch of the whole document.
    const pageLines: Line[][] = [];
    let characters = 0;
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      let lines: Line[];
      try {
        const page = await doc.getPage(pageNumber);
        const content = await page.getTextContent();
        lines = linesFrom(content.items);
        page.cleanup();
      } catch (cause) {
        throw new ExtractionError("malformed", { kind: "pdf", cause });
      }
      for (const line of lines) characters += line.text.replace(/\s/g, "").length;
      // Over the word cap already: stop before reading the remaining pages.
      if (characters > MAX_CHARACTERS) throw new ExtractionError("too-long", { kind: "pdf", cap: "words" });
      pageLines.push(lines);
    }

    if (characters < MIN_TEXT_CHARACTERS) {
      throw new ExtractionError("no-text", { kind: "pdf" });
    }
    const pitch = documentPitch(pageLines);
    const pages: PageParagraphs[] = pageLines.map((lines, index) => ({ page: index + 1, paragraphs: paragraphsFrom(lines, pitch) }));
    return { pageCount: doc.numPages, chunks: toChunks(pages) };
  } finally {
    await task.destroy();
  }
}

/** pdf.js signals a password with PasswordException; every other failure to open is damage. */
function classifyOpenFailure(cause: unknown): ExtractionError {
  const name = typeof cause === "object" && cause !== null ? (cause as { name?: unknown }).name : undefined;
  if (name === "PasswordException") return new ExtractionError("encrypted", { kind: "pdf", cause });
  return new ExtractionError("malformed", { kind: "pdf", cause });
}

// --- layout reconstruction -------------------------------------------------

/** A text run placed in its own reading frame (see `place`). */
interface Run {
  text: string;
  /** Position of the run's start along the baseline. */
  along: number;
  /** Position across lines; earlier lines have larger values (like y for upright text). */
  across: number;
  /** Baseline direction, in whole degrees; runs of different orientation never share a frame. */
  angle: number;
  /** Font size. */
  size: number;
  width: number;
  dir: "ltr" | "rtl" | "ttb";
}

export interface Line {
  text: string;
  across: number;
  angle: number;
  /** The largest font size on the line. */
  size: number;
  /** Extent along the baseline. */
  start: number;
  end: number;
}

/** A line while its runs are still being collected. */
interface OpenLine extends Line {
  runs: Run[];
}

/** Runs within half a line height of each other across the page share a line. */
const SAME_LINE_TOLERANCE = 0.5;
/** A horizontal gap wider than this fraction of the font size is a missing space. */
const WORD_GAP_RATIO = 0.15;
/** A line gap this many times the page's line pitch starts a new paragraph. */
const PARAGRAPH_GAP_RATIO = 1.3;
/** Line gaps, in font sizes, that can be a line pitch; smaller ones are artefacts, larger ones are spacing. */
const MIN_PITCH_EM = 0.8;
const MAX_PITCH_EM = 3.5;
/** Line pitch assumed when a page offers no plausible gap to measure. */
const DEFAULT_PITCH_EM = 1.2;
/** A line narrower than this fraction of the page's usual line width "ended early". */
const SHORT_LINE_RATIO = 0.7;
/** "7.1 ", "12.3.4 ", "(b) ", "(iv) ", "3. " at the start of a line. */
const CLAUSE_START = /^(?:\(?\d{1,2}(?:\.\d{1,2}){1,3}\)?|\d{1,2}\.|\([a-z]{1,2}\)|\([ivx]{1,5}\))\s+\S/;

function isTextItem(item: TextItem | TextMarkedContent): item is TextItem {
  return "str" in item;
}

/**
 * pdf.js gives every run a transform [a b c d e f]: (a, b) is the baseline
 * direction scaled by the font's horizontal size, (c, d) the upward direction
 * scaled by its vertical size, (e, f) the origin. Projecting the origin onto
 * the baseline gives the position along the line; projecting it onto the
 * downward normal gives the position across lines. For upright text that is
 * plainly x and y; for a rotated page it is the same thing in the text's own
 * frame. The frame's angle is kept so that runs of different orientation
 * (body text and a diagonal watermark) are never compared as if they shared
 * one.
 */
function place(item: TextItem): Run | undefined {
  const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = item.transform;
  const scale = Math.hypot(a, b);
  const size = Math.hypot(c, d) || scale;
  if (!(scale > 0) || !(size > 0)) return undefined;
  const ux = a / scale;
  const uy = b / scale;
  const angle = Math.round((Math.atan2(uy, ux) * 180) / Math.PI);
  return { text: item.str, along: e * ux + f * uy, across: f * ux - e * uy, angle, size, width: item.width, dir: item.dir as Run["dir"] };
}

/**
 * Groups runs into lines. Runs are taken in content-stream order, which is
 * reading order for documents produced by word processors; a run joins the
 * current line when it has the same orientation, sits on (nearly) the same
 * baseline and the previous run did not end its line. Within a line the runs
 * are then put in visual order (by position, right-to-left for RTL runs) and
 * a space is inserted where a gap shows one was dropped.
 */
export function linesFrom(items: ReadonlyArray<TextItem | TextMarkedContent>): Line[] {
  const lines: OpenLine[] = [];
  let current: OpenLine | undefined;
  let breakBefore = false;

  for (const item of items) {
    if (!isTextItem(item)) continue;
    if (item.str.length === 0) {
      if (item.hasEOL) breakBefore = true;
      continue;
    }
    const run = place(item);
    if (!run) continue;

    const onCurrentLine =
      current !== undefined &&
      !breakBefore &&
      run.angle === current.angle &&
      Math.abs(run.across - current.across) <= SAME_LINE_TOLERANCE * Math.max(run.size, current.size);

    if (onCurrentLine && current) {
      current.runs.push(run);
      current.size = Math.max(current.size, run.size);
      current.start = Math.min(current.start, run.along);
      current.end = Math.max(current.end, run.along + run.width);
    } else {
      current = { text: "", across: run.across, angle: run.angle, size: run.size, start: run.along, end: run.along + run.width, runs: [run] };
      lines.push(current);
    }
    breakBefore = item.hasEOL;
  }

  return lines
    .map(({ runs, ...line }) => ({ ...line, text: joinRuns(runs) }))
    .filter((line) => line.text.trim().length > 0);
}

/** Runs in visual order with the spaces the layout implies. */
function joinRuns(runs: Run[]): string {
  const rtl = runs.filter((run) => run.dir === "rtl").length > runs.length / 2;
  const ordered = runs.every((run) => run.dir === "ttb") ? runs : [...runs].sort((p, q) => (rtl ? q.along - p.along : p.along - q.along));
  let text = "";
  let lastEnd: number | undefined;
  for (const run of ordered) {
    const gap = lastEnd === undefined ? 0 : rtl ? lastEnd - (run.along + run.width) : run.along - lastEnd;
    const needsSpace = gap > WORD_GAP_RATIO * run.size && !text.endsWith(" ") && !run.text.startsWith(" ");
    text += (needsSpace ? " " : "") + run.text;
    lastEnd = rtl ? run.along : run.along + run.width;
  }
  return text;
}

/**
 * Groups lines into paragraphs. Lines are first separated by orientation —
 * body text, then anything rotated (a diagonal watermark, a margin note) —
 * so a watermark run that lands between two body lines cannot split their
 * paragraph or distort the page's line pitch. Within one orientation a new
 * paragraph starts at a gap clearly larger than the line pitch, at an upward
 * jump (a new column or block), or at a clause number following a line that
 * ended early.
 */
export function paragraphsFrom(lines: Line[], documentPitch: number | null = null): string[] {
  return orientationStreams(lines).flatMap((stream) => paragraphsFromStream(stream, documentPitch));
}

/** Plausible gaps are counted in bins this wide, in font sizes, when the document's usual spacing is measured. */
const PITCH_BIN_EM = 0.05;

/**
 * The document's line pitch: the spacing most of its consecutive lines
 * share, in font sizes, or null when no page offers a plausible gap. A page
 * whose lines are all equally spaced cannot tell on its own whether that
 * spacing is its line pitch (one paragraph) or its paragraph spacing (a run
 * of one-line paragraphs, as on a signature page); the document's pitch can.
 *
 * It is the most frequent gap in the document, not the smallest: wrapped
 * body lines outnumber everything else in a contract, so the mode is the
 * body's pitch, where the smallest gap anywhere (a tightly set letterhead, a
 * footer block) would make every uniformly spaced page split at each line,
 * and a document that is double spaced throughout keeps its own pitch. In a
 * document made mostly of one-line paragraphs the mode is the paragraph
 * spacing instead; a uniform page then reads as one paragraph, which is
 * what it read as before this measure existed. Neighbouring bins are
 * counted together so a pitch that straddles a bin edge still wins, and a
 * tie goes to the tighter spacing, since paragraph spacing is never smaller
 * than the line pitch.
 */
export function documentPitch(pages: readonly Line[][]): number | null {
  const bins = new Map<number, { count: number; sum: number }>();
  for (const lines of pages) {
    for (const stream of orientationStreams(lines)) {
      for (const gap of plausibleGaps(stream)) {
        const bin = Math.round(gap / PITCH_BIN_EM);
        const entry = bins.get(bin) ?? { count: 0, sum: 0 };
        entry.count += 1;
        entry.sum += gap;
        bins.set(bin, entry);
      }
    }
  }
  let best: { bin: number; count: number } | null = null;
  for (const bin of bins.keys()) {
    const count = [bin - 1, bin, bin + 1].reduce((total, near) => total + (bins.get(near)?.count ?? 0), 0);
    if (best === null || count > best.count || (count === best.count && bin < best.bin)) best = { bin, count };
  }
  if (best === null) return null;
  let count = 0;
  let sum = 0;
  for (const near of [best.bin - 1, best.bin, best.bin + 1]) {
    const entry = bins.get(near);
    if (entry) {
      count += entry.count;
      sum += entry.sum;
    }
  }
  return sum / count;
}

/** Lines grouped by baseline angle, the most common orientation first, each in page order. */
function orientationStreams(lines: Line[]): Line[][] {
  const streams = new Map<number, Line[]>();
  for (const line of lines) {
    const stream = streams.get(line.angle);
    if (stream) stream.push(line);
    else streams.set(line.angle, [line]);
  }
  return [...streams.values()].sort((p, q) => q.length - p.length);
}

function paragraphsFromStream(lines: Line[], documentPitch: number | null): string[] {
  if (lines.length === 0) return [];
  const gaps = lines.map((line, i) => (i === 0 ? 0 : gapInEm(lines[i - 1]!, line)));
  const pitch = typicalPitch(gaps, documentPitch);
  const usualWidth = typicalWidth(lines);

  const groups: string[][] = [[lines[0]!.text]];
  for (let i = 1; i < lines.length; i++) {
    const previous = lines[i - 1]!;
    const line = lines[i]!;
    const gap = gaps[i]!;
    const previousEndedEarly = previous.end - previous.start < SHORT_LINE_RATIO * usualWidth;
    const startsParagraph =
      gap > PARAGRAPH_GAP_RATIO * pitch ||
      gap > MAX_PITCH_EM ||
      gap < -1 ||
      (previousEndedEarly && CLAUSE_START.test(line.text));
    if (startsParagraph) groups.push([line.text]);
    else groups[groups.length - 1]!.push(line.text);
  }

  return groups.map((group) => normalizeParagraph(group.join(" "))).filter((text) => text.length > 0);
}

/** Distance from one line down to the next, in units of the larger font size. */
function gapInEm(previous: Line, line: Line): number {
  return (previous.across - line.across) / Math.max(previous.size, line.size, 1);
}

/** Gaps within one page-order stream of lines, in font sizes; gaps outside the plausible range are ignored. */
function plausibleGaps(lines: Line[]): number[] {
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const gap = gapInEm(lines[i - 1]!, lines[i]!);
    if (gap >= MIN_PITCH_EM && gap <= MAX_PITCH_EM) gaps.push(gap);
  }
  return gaps;
}

/** Gaps that differ by less than this, in font sizes, count as the same spacing. */
const UNIFORM_GAP_TOLERANCE_EM = 0.1;

/** Whether a set of gaps shows a single spacing (or nothing at all). */
function isUniform(gaps: readonly number[]): boolean {
  return gaps.length === 0 || Math.max(...gaps) - Math.min(...gaps) < UNIFORM_GAP_TOLERANCE_EM;
}

/**
 * The page's line pitch is the smallest plausible gap between consecutive
 * lines. Paragraph spacing is always at least the line pitch, so the minimum
 * is right even on a page of one-line paragraphs with a single wrapped line,
 * and measuring in font sizes keeps a small-print footer from shrinking the
 * body's pitch. (The trade-off: a double-spaced body under a single-spaced
 * header splits per line — rare in the contracts this serves.)
 *
 * A page whose plausible gaps are all the same has nothing to compare: it is
 * one paragraph, or a run of one-line paragraphs (a signature page, a title
 * page). When the document's usual line pitch is known and clearly tighter
 * than that uniform spacing, the spacing is paragraph spacing. (A lone
 * double-spaced paragraph filling a page of an otherwise single-spaced
 * document splits per line under this rule; a title or signature page read
 * as one paragraph is the far more common mistake.)
 */
function typicalPitch(gaps: number[], documentPitch: number | null): number {
  const plausible = gaps.filter((gap) => gap >= MIN_PITCH_EM && gap <= MAX_PITCH_EM);
  if (plausible.length === 0) return DEFAULT_PITCH_EM;
  const pitch = Math.min(...plausible);
  if (isUniform(plausible) && documentPitch !== null && pitch > PARAGRAPH_GAP_RATIO * documentPitch) return documentPitch;
  return pitch;
}


/** The width most full lines reach: the 90th percentile of line widths. */
function typicalWidth(lines: Line[]): number {
  const widths = lines.map((line) => line.end - line.start).sort((a, b) => a - b);
  return widths[Math.min(widths.length - 1, Math.floor(widths.length * 0.9))] ?? 0;
}
