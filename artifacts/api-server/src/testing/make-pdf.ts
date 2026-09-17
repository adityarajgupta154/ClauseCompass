/**
 * A tiny PDF writer for tests. It produces uncompressed, single-font PDFs
 * with real page structure, so the extractor is exercised on genuine PDF
 * syntax without committing any binary fixture (PRD §11: synthetic
 * text/JSON fixtures only). Text is set in Helvetica with WinAnsi encoding,
 * one `Tj` per line, `T*` for blank lines, so a blank line is a vertical gap
 * of exactly two leadings, the way a word processor would export it.
 */

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 72;
const FONT_SIZE = 11;
const LEADING = 14;
/** Roughly how many Helvetica 11pt characters fit between the margins. */
const WRAP_COLUMNS = 84;

export interface PdfPage {
  page: number;
  paragraphs: string[];
}

export interface MadePdf {
  bytes: Uint8Array;
  /** Which paragraphs landed on which page, in the exact text that was written. */
  pages: PdfPage[];
  pageCount: number;
}

export interface MakePdfOptions {
  /** Lines per page before a new page starts; low values force pagination. */
  linesPerPage?: number;
  /**
   * How paragraphs are separated: `{ blankLines: n }` leaves n empty lines
   * (a typewriter-style export); `{ spaceAfterPt: n }` adds n points below a
   * paragraph with no blank line, the way Word's "space after" exports.
   */
  separator?: { blankLines: number } | { spaceAfterPt: number };
}

/** Marks a paragraph break rendered as extra leading rather than a blank line. */
const SPACE_AFTER_MARK = "\f";

/**
 * Lays paragraphs out with word wrapping, a blank line between paragraphs,
 * and a page break whenever the next paragraph would not fit whole, so no
 * paragraph is split across pages and the returned page map is exact.
 */
export function makePdf(paragraphs: string[], options: MakePdfOptions = {}): MadePdf {
  const linesPerPage = options.linesPerPage ?? Math.floor((PAGE_HEIGHT - 2 * MARGIN) / LEADING);
  const separator = options.separator ?? { blankLines: 1 };
  const separatorLines = "blankLines" in separator ? Array<string>(separator.blankLines).fill("") : [SPACE_AFTER_MARK];
  const spaceAfterPt = "spaceAfterPt" in separator ? separator.spaceAfterPt : 0;

  const pages: { lines: string[]; paragraphs: string[] }[] = [];
  let current = { lines: [] as string[], paragraphs: [] as string[] };
  const flush = () => {
    if (current.lines.length > 0) pages.push(current);
    current = { lines: [], paragraphs: [] };
  };

  for (const raw of paragraphs) {
    const text = toWinAnsiText(raw);
    const wrapped = wrap(text, WRAP_COLUMNS);
    if (wrapped.length > linesPerPage) {
      throw new Error(`makePdf: a paragraph of ${wrapped.length} lines cannot fit on a ${linesPerPage}-line page`);
    }
    const separatorHeight = current.lines.length > 0 ? separatorLines.length : 0;
    if (current.lines.length + separatorHeight + wrapped.length > linesPerPage) flush();
    if (current.lines.length > 0) current.lines.push(...separatorLines);
    current.lines.push(...wrapped);
    current.paragraphs.push(text);
  }
  flush();

  return {
    bytes: writePdf(
      pages.map((page) => page.lines),
      { spaceAfterPt },
    ),
    pages: pages.map((page, index) => ({ page: index + 1, paragraphs: page.paragraphs })),
    pageCount: pages.length,
  };
}

/** A structurally valid PDF whose trailer claims standard-security encryption with garbage keys. */
export function makeEncryptedPdf(): Uint8Array {
  return writePdf([["This text is behind a password."]], { fakeEncryption: true });
}

/** A PDF with the requested number of pages that draw nothing: a scan without OCR looks like this. */
export function makeEmptyPdf(pageCount: number): Uint8Array {
  return writePdf(Array.from({ length: pageCount }, () => []));
}

// --- text preparation ------------------------------------------------------

const REPLACEMENTS: Record<string, string> = {
  "\u20b9": "INR ",
  "\u2013": "-",
  "\u2014": "-",
  "\u2018": "'",
  "\u2019": "'",
  "\u201c": '"',
  "\u201d": '"',
  "\u2026": "...",
};

/** WinAnsi cannot carry every character; map the usual suspects and mark the rest. */
function toWinAnsiText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\u0100-\uffff]/g, (char) => REPLACEMENTS[char] ?? "?")
    .replace(/\s+/g, " ")
    .trim();
}

function wrap(text: string, columns: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line.length === 0) line = word;
    else if (line.length + 1 + word.length <= columns) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

// --- PDF syntax ------------------------------------------------------------

function escapePdfString(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function writePdf(
  pagesOfLines: string[][],
  options: { fakeEncryption?: boolean; spaceAfterPt?: number } = {},
): Uint8Array {
  const objects: string[] = [];
  const add = (body: string): number => {
    objects.push(body);
    return objects.length;
  };

  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");

  const contentIds = pagesOfLines.map((lines) => {
    if (lines.length === 0) return add("<< /Length 0 >>\nstream\n\nendstream");
    let stream = `BT /F1 ${FONT_SIZE} Tf ${LEADING} TL ${MARGIN} ${PAGE_HEIGHT - MARGIN - FONT_SIZE} Td\n`;
    for (const line of lines) {
      if (line === "") stream += "T*\n";
      else if (line === SPACE_AFTER_MARK) stream += `0 -${options.spaceAfterPt ?? 0} Td\n`;
      else stream += `(${escapePdfString(line)}) Tj T*\n`;
    }
    stream += "ET";
    return add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
  });

  // The Pages object is allocated after every Page object; its number is known in advance.
  const pagesId = objects.length + contentIds.length + 1;
  const pageIds = contentIds.map((contentId) =>
    add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    ),
  );
  const allocatedPagesId = add(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`,
  );
  if (allocatedPagesId !== pagesId) throw new Error("makePdf: object numbering drifted");
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let encryptId = 0;
  if (options.fakeEncryption) {
    encryptId = add(
      `<< /Filter /Standard /V 1 /R 2 /Length 40 /P -1 /O <${"ab".repeat(32)}> /U <${"cd".repeat(32)}> >>`,
    );
  }

  let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  out +=
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R ` +
    `/ID [<${"01".repeat(16)}> <${"02".repeat(16)}>]` +
    (options.fakeEncryption ? ` /Encrypt ${encryptId} 0 R` : "") +
    ` >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}
