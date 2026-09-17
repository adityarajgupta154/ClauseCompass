import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { describe, expect, it } from "vitest";
import { documentPitch, linesFrom, paragraphsFrom } from "./pdf";

/**
 * Direct tests of the layout reconstruction with hand-built pdf.js text
 * items, for cases the generated PDFs do not produce: irregular spacing,
 * mixed font sizes, rotated pages, out-of-order runs and degenerate items.
 */

interface ItemOptions {
  size?: number;
  hasEOL?: boolean;
  /** Baseline rotation in degrees, counter-clockwise. */
  rotate?: number;
  width?: number;
  dir?: "ltr" | "rtl" | "ttb";
  /** Horizontal text scaling (Tz): stretches the baseline vector without changing the font size. */
  stretch?: number;
}

function item(str: string, x: number, y: number, options: ItemOptions = {}): TextItem {
  const size = options.size ?? 12;
  const angle = ((options.rotate ?? 0) * Math.PI) / 180;
  const stretch = options.stretch ?? 1;
  const a = size * Math.cos(angle);
  const b = size * Math.sin(angle);
  return {
    str,
    dir: options.dir ?? "ltr",
    transform: [a * stretch, b * stretch, -b, a, x, y],
    width: options.width ?? str.length * size * 0.5,
    height: size,
    fontName: "F1",
    hasEOL: options.hasEOL ?? true,
  };
}

/** Lays out paragraphs top-down: each entry is a list of lines; `gapAfter` is the extra space below the paragraph. */
function page(paragraphs: string[][], { pitch = 14, gapAfter = 6, size = 12, x = 72 } = {}): TextItem[] {
  const items: TextItem[] = [];
  let y = 720;
  for (const lines of paragraphs) {
    for (const line of lines) {
      items.push(item(line, x, y, { size }));
      y -= pitch;
    }
    y -= gapAfter;
  }
  return items;
}

const texts = (items: TextItem[]) => paragraphsFrom(linesFrom(items));

describe("paragraphsFrom", () => {
  it("keeps a single wrapped line together on a page of one-line paragraphs", () => {
    const items = page([
      ["1. First short clause."],
      ["2. Second short clause."],
      ["3. Third clause that runs long enough", "to wrap onto a second line."],
      ["4. Fourth short clause."],
      ["5. Fifth short clause."],
      ["6. Sixth short clause."],
    ]);
    expect(texts(items)).toEqual([
      "1. First short clause.",
      "2. Second short clause.",
      "3. Third clause that runs long enough to wrap onto a second line.",
      "4. Fourth short clause.",
      "5. Fifth short clause.",
      "6. Sixth short clause.",
    ]);
  });

  it("splits a page of one-line paragraphs by the document's line pitch, which the page alone cannot measure", () => {
    const body = linesFrom(
      page([
        ["1. A clause that wraps onto", "a second line and", "a third."],
        ["2. Another clause that wraps", "as well, onto", "three lines."],
      ]),
    );
    // A signature page: four one-line paragraphs, a blank line between each, no wrapped line anywhere.
    const signatures = linesFrom(
      page([["SIGNED for and on behalf of the Licensor"], ["Name: A. Sharma"], ["SIGNED by the Licensee"], ["Name: K. Anand"]], { gapAfter: 14 }),
    );
    // On its own the page's only spacing looks like its line pitch, and it collapses into one paragraph.
    expect(paragraphsFrom(signatures)).toEqual(["SIGNED for and on behalf of the Licensor Name: A. Sharma SIGNED by the Licensee Name: K. Anand"]);
    const pitch = documentPitch([body, signatures]);
    expect(pitch).toBeCloseTo(14 / 12, 5);
    expect(paragraphsFrom(signatures, pitch)).toEqual(["SIGNED for and on behalf of the Licensor", "Name: A. Sharma", "SIGNED by the Licensee", "Name: K. Anand"]);
    // The body page reads the same either way.
    expect(paragraphsFrom(body, pitch)).toEqual(paragraphsFrom(body));
  });

  it("keeps a uniformly spaced page as one paragraph when its spacing is the document's own line pitch", () => {
    const body = linesFrom(page([["First paragraph, one line."], ["Second paragraph that wraps onto", "another line."]]));
    const dense = linesFrom(page([["Line one of a long paragraph", "line two", "line three", "line four"]]));
    expect(paragraphsFrom(dense, documentPitch([body, dense]))).toEqual(["Line one of a long paragraph line two line three line four"]);
    // With no measurable pitch anywhere (single-line pages only), nothing changes.
    expect(documentPitch([linesFrom(page([["Only line."]]))])).toBeNull();
  });

  it("measures the document's pitch as the spacing most lines share, so one tightly set block cannot split every uniform page", () => {
    // A letterhead set tighter than the body (pitch 11 on 12pt) above three wrapped body paragraphs at 14.
    const letterhead = page([["Halcyon Grid Consulting LLP", "Registered office, New Delhi"]], { pitch: 11, gapAfter: 0 });
    const body = page(
      [
        ["1. A clause that wraps onto", "a second line and", "a third."],
        ["2. Another clause that wraps", "as well."],
        ["3. A third clause that also", "wraps."],
      ],
      { gapAfter: 8 },
    );
    const pageOne = linesFrom([...letterhead, ...body.map((item) => ({ ...item, transform: [...item.transform.slice(0, 5), item.transform[5]! - 40] }))]);
    // A page holding one long paragraph at the body's pitch, and the signature page from the case above.
    const dense = linesFrom(page([["Line one of a long paragraph", "line two", "line three", "line four", "line five"]]));
    const signatures = linesFrom(page([["SIGNED for the Licensor"], ["Name: A. Sharma"], ["SIGNED by the Licensee"], ["Name: K. Anand"]], { gapAfter: 14 }));
    const pitch = documentPitch([pageOne, dense, signatures]);
    // The body's 14pt pitch, not the letterhead's 11pt (the smallest) and not the signature page's 28pt.
    expect(pitch).toBeCloseTo(14 / 12, 5);
    expect(paragraphsFrom(dense, pitch)).toEqual(["Line one of a long paragraph line two line three line four line five"]);
    expect(paragraphsFrom(signatures, pitch)).toHaveLength(4);
    // A tight two-line block and a uniform page, nothing else: the uniform page is one paragraph.
    const tight = linesFrom(page([["Header line one", "header line two"]], { pitch: 11 }));
    const three = linesFrom(page([["Line one of a paragraph", "line two", "line three"]]));
    expect(paragraphsFrom(three, documentPitch([tight, three]))).toEqual(["Line one of a paragraph line two line three"]);
  });

  it("leaves a double-spaced document alone: its uniform pages are at its own pitch", () => {
    // Double spacing with a blank line between paragraphs: the paragraph gap is too wide to be a plausible pitch, so every page looks uniform.
    const pages = [
      page([["1. A clause set double spaced", "that wraps onto a second line."], ["2. Another clause that wraps", "as well."]], { pitch: 28, gapAfter: 28 }),
      page([["3. A long clause that fills", "the page on its own", "line after line", "at the same spacing."]], { pitch: 28, gapAfter: 0 }),
    ].map(linesFrom);
    const pitch = documentPitch(pages);
    expect(pitch).toBeCloseTo(28 / 12, 5);
    expect(paragraphsFrom(pages[1]!, pitch)).toEqual(["3. A long clause that fills the page on its own line after line at the same spacing."]);
    expect(paragraphsFrom(pages[0]!, pitch)).toEqual([
      "1. A clause set double spaced that wraps onto a second line.",
      "2. Another clause that wraps as well.",
    ]);
    // With a single-spaced letterhead in front, the double-spaced pages still read the same: most lines are double spaced.
    const letterhead = linesFrom(page([["Halcyon Grid Consulting LLP", "Registered office, New Delhi"], ["Private and confidential"]], { pitch: 14, gapAfter: 6 }));
    const mixed = documentPitch([letterhead, ...pages]);
    expect(mixed).toBeCloseTo(28 / 12, 5);
    expect(paragraphsFrom(pages[1]!, mixed)).toHaveLength(1);
  });

  it("measures the document's pitch in font sizes, so a small-print section shares the body's pitch", () => {
    // Body at 12pt on 14pt; a schedule at 9pt on 10.5pt — the same 1.1667 em.
    const body = linesFrom(page([["1. A clause that wraps onto", "a second line."], ["2. Another clause that wraps", "as well."]]));
    const schedule = linesFrom(page([["Schedule A, item one, which wraps", "onto a second line."], ["Item two, which also wraps", "onto another."]], { pitch: 10.5, size: 9, gapAfter: 4.5 }));
    expect(documentPitch([body, schedule])).toBeCloseTo(14 / 12, 5);
    expect(paragraphsFrom(schedule, documentPitch([body, schedule]))).toEqual([
      "Schedule A, item one, which wraps onto a second line.",
      "Item two, which also wraps onto another.",
    ]);
  });

  it("does not let a small-print footer split the body into single lines", () => {
    const body = page([["The body of the contract continues here", "across several wrapped lines of text", "before the next paragraph starts."], ["A second body paragraph follows."]], {
      size: 12,
      pitch: 14.4,
      gapAfter: 8,
    });
    const footer = [
      item("Registered office: 1 Example Road.", 72, 60, { size: 8 }),
      item("Page 1 of 3", 72, 50, { size: 8 }),
    ];
    expect(texts([...body, ...footer])).toEqual([
      "The body of the contract continues here across several wrapped lines of text before the next paragraph starts.",
      "A second body paragraph follows.",
      "Registered office: 1 Example Road. Page 1 of 3",
    ]);
  });

  it("treats a page with uniform spacing as a single paragraph", () => {
    const items = page([["one", "two", "three", "four"]], { gapAfter: 0 });
    expect(texts(items)).toEqual(["one two three four"]);
  });

  it("splits at an upward jump (a new column or text block)", () => {
    const left = [item("Left column line one.", 72, 700), item("Left column line two.", 72, 686)];
    const right = [item("Right column line one.", 320, 700), item("Right column line two.", 320, 686)];
    expect(texts([...left, ...right])).toEqual(["Left column line one. Left column line two.", "Right column line one. Right column line two."]);
  });

  it("splits at a clause number after a short line even with no extra spacing", () => {
    const items = page([["7. TERMINATION", "7.1 Either party may terminate this agreement on sixty days'", "written notice to the other party.", "7.2 The Company may terminate at once for misconduct."]], {
      gapAfter: 0,
    });
    expect(texts(items)).toEqual([
      "7. TERMINATION",
      "7.1 Either party may terminate this agreement on sixty days' written notice to the other party.",
      "7.2 The Company may terminate at once for misconduct.",
    ]);
  });

  it("does not split at a number that merely starts a wrapped full-width line", () => {
    const items = page([["The deposit of Rs. 2,00,000 is refundable within thirty days,", "2. being the number of instalments agreed, and the rest follows on", "the same terms as before without any further deduction at all."]], {
      gapAfter: 0,
    });
    expect(texts(items)).toHaveLength(1);
  });
});

describe("linesFrom", () => {
  it("joins runs on one baseline, inserting a space where the gap shows one was dropped", () => {
    const items = [
      item("Hello", 72, 700, { hasEOL: false, width: 30 }),
      item("world", 106, 700, { hasEOL: false, width: 30 }), // gap of 4pt at 12pt font: a missing space
      item(",", 136, 700, { hasEOL: false, width: 3 }), // touching: no space
      item("again", 72, 686),
    ];
    expect(linesFrom(items).map((line) => line.text)).toEqual(["Hello world,", "again"]);
  });

  it("respects hasEOL between runs on the same baseline and ignores empty runs", () => {
    const items = [
      item("Left cell", 72, 700, { hasEOL: true }),
      item("", 200, 700, { hasEOL: true }),
      item("Right cell", 320, 700, { hasEOL: true }),
    ];
    expect(linesFrom(items).map((line) => line.text)).toEqual(["Left cell", "Right cell"]);
  });

  it("puts out-of-order runs on the same line in visual order with a separating space", () => {
    const items = [item("world", 120, 700, { hasEOL: false, width: 30 }), item("Hello", 72, 700, { hasEOL: false, width: 30 })];
    expect(linesFrom(items).map((line) => line.text)).toEqual(["Hello world"]);
  });

  it("orders right-to-left runs from the right", () => {
    // Logical order "שלום עולם": the first word sits to the right of the second.
    const items = [item("שלום", 150, 700, { hasEOL: false, width: 30, dir: "rtl" }), item("עולם", 100, 700, { hasEOL: false, width: 30, dir: "rtl" })];
    expect(linesFrom(items).map((line) => line.text)).toEqual(["שלום עולם"]);
  });

  it("measures line pitch by the font's vertical size even when text is stretched horizontally", () => {
    // 12 pt text with 150% horizontal scaling; 14 pt line pitch and a 24 pt paragraph gap.
    const items = [
      item("Stretched line one", 72, 700, { stretch: 1.5 }),
      item("stretched line two.", 72, 686, { stretch: 1.5 }),
      item("Next paragraph.", 72, 662, { stretch: 1.5 }),
    ];
    expect(paragraphsFrom(linesFrom(items))).toEqual(["Stretched line one stretched line two.", "Next paragraph."]);
  });

  it("keeps a diagonal watermark out of the body text's lines and paragraphs", () => {
    const items = [
      item("Body line one continues", 72, 700),
      item("DRAFT", 200, 690, { rotate: 45, size: 60, width: 200 }),
      item("body line two.", 72, 686),
      item("Second paragraph.", 72, 660),
    ];
    const lines = linesFrom(items);
    expect(lines.map((line) => line.text)).toEqual(["Body line one continues", "DRAFT", "body line two.", "Second paragraph."]);
    // Body paragraphs stay whole; the watermark becomes its own trailing paragraph.
    expect(paragraphsFrom(lines)).toEqual(["Body line one continues body line two.", "Second paragraph.", "DRAFT"]);
  });

  it("skips runs with a degenerate transform and drops whitespace-only lines", () => {
    const zero = { ...item("ghost", 72, 700), transform: [0, 0, 0, 0, 72, 700] };
    const items = [zero, item("   ", 72, 686), item("real", 72, 672)];
    expect(linesFrom(items).map((line) => line.text)).toEqual(["real"]);
  });

  it("reconstructs lines and paragraphs on a page whose text is rotated 90 degrees", () => {
    // Text runs upward; successive lines step to the right.
    const rotated = [
      item("First paragraph line one,", 72, 100, { rotate: 90, hasEOL: false, width: 120 }),
      item("continued.", 72, 224, { rotate: 90 }),
      item("First paragraph line two.", 86, 100, { rotate: 90 }),
      item("Second paragraph after a gap.", 106, 100, { rotate: 90 }),
    ];
    expect(linesFrom(rotated).map((line) => line.text)).toEqual([
      "First paragraph line one, continued.",
      "First paragraph line two.",
      "Second paragraph after a gap.",
    ]);
    expect(paragraphsFrom(linesFrom(rotated))).toEqual(["First paragraph line one, continued. First paragraph line two.", "Second paragraph after a gap."]);
  });
});
