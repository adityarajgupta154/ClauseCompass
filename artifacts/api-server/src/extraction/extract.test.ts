import { describe, expect, it } from "vitest";
import { makeDocx, OLE_SIGNATURE, zipStore } from "../testing/make-docx";
import { fixtureParagraphs, loadFixtures, type Fixture } from "../testing/fixtures";
import { makeEmptyPdf, makeEncryptedPdf, makePdf } from "../testing/make-pdf";
import { extractDocument, ExtractionError, MAX_FILE_BYTES, MAX_PAGES, type ExtractedDocument } from "./index";

const fixtures = loadFixtures();

async function expectRefusal(input: Parameters<typeof extractDocument>[0], code: ExtractionError["code"]) {
  let caught: unknown;
  try {
    await extractDocument(input);
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(ExtractionError);
  const error = caught as ExtractionError;
  expect(error.code).toBe(code);
  expect(error.status).toBeGreaterThanOrEqual(400);
  expect(error.status).toBeLessThan(500);
  expect(error.message).not.toMatch(/\bat\s+\S+\s*\(|node_modules|Error:/);
  return error;
}

/** Checks the invariants every extraction result must satisfy. */
function expectWellFormed(document: ExtractedDocument) {
  expect(document.chunks.length).toBeGreaterThan(0);
  document.chunks.forEach((chunk, index) => {
    expect(chunk.paragraphIndex).toBe(index + 1);
    expect(chunk.text.length).toBeGreaterThan(0);
    expect(chunk.text).toBe(chunk.text.trim());
    expect(chunk.text).not.toMatch(/\s{2}|[\r\n\t]/);
    if (document.pageCount === null) expect(chunk.page).toBeNull();
    else {
      expect(chunk.page).toBeGreaterThanOrEqual(1);
      expect(chunk.page).toBeLessThanOrEqual(document.pageCount);
    }
  });
  const pages = document.chunks.map((chunk) => chunk.page ?? 0);
  expect([...pages].sort((a, b) => a - b)).toEqual(pages);
}

function expectGolden(document: ExtractedDocument, fixture: Fixture) {
  expect(document.chunks).toHaveLength(fixture.golden.paragraphCount);
  expect(document.wordCount).toBe(fixture.golden.wordCount);
  for (const anchor of fixture.golden.anchors) {
    const chunk = document.chunks[anchor.paragraphIndex - 1];
    expect(chunk, `paragraph ${anchor.paragraphIndex} of ${fixture.id}`).toBeDefined();
    expect(chunk!.text.startsWith(anchor.startsWith), `paragraph ${anchor.paragraphIndex} of ${fixture.id}: "${chunk!.text.slice(0, 60)}"`).toBe(true);
  }
}

describe("extractDocument: TXT fixtures", () => {
  for (const fixture of fixtures) {
    it(`${fixture.id}: every paragraph, numbered in order, matching the golden file`, async () => {
      const document = await extractDocument({ bytes: fixture.bytes, filename: `${fixture.id}.txt` });
      expect(document.kind).toBe("txt");
      expect(document.pageCount).toBeNull();
      expectWellFormed(document);
      expectGolden(document, fixture);
      // Nothing is lost: every non-blank source line is inside its paragraph.
      const joined = document.chunks.map((chunk) => chunk.text).join("\n");
      for (const line of fixture.text.split("\n")) {
        const normalized = line.split(/\s+/).filter(Boolean).join(" ");
        if (normalized) expect(joined).toContain(normalized);
      }
    });
  }

  it("accepts CRLF line endings, a UTF-8 BOM and a MIME type in place of an extension", async () => {
    const crlf = fixtures[0]!.text.replace(/\n/g, "\r\n");
    const bytes = new Uint8Array(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(crlf, "utf8")]));
    const document = await extractDocument({ bytes, filename: "upload", mimeType: "text/plain; charset=utf-8" });
    expectGolden(document, fixtures[0]!);
    expect(document.chunks[0]!.text.startsWith("[")).toBe(true);
  });

  it("reads UTF-16 with a byte-order mark and Windows-1252 without one", async () => {
    const utf16 = new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("First para.\n\nSecond para.", "utf16le")]));
    const fromUtf16 = await extractDocument({ bytes: utf16, filename: "a.txt" });
    expect(fromUtf16.chunks.map((chunk) => chunk.text)).toEqual(["First para.", "Second para."]);

    const cp1252 = new Uint8Array(Buffer.from("Caf\xe9 agreement.\n\nR\xe9sum\xe9.", "latin1"));
    const fromCp1252 = await extractDocument({ bytes: cp1252, filename: "b.txt" });
    expect(fromCp1252.chunks.map((chunk) => chunk.text)).toEqual(["Café agreement.", "Résumé."]);
  });
});

describe("extractDocument: PDF (generated from the fixtures)", () => {
  for (const fixture of fixtures) {
    it(`${fixture.id}: paragraphs come back verbatim with the page each one was printed on`, async () => {
      const made = makePdf(fixtureParagraphs(fixture), { linesPerPage: 24 });
      expect(made.pageCount).toBeGreaterThan(2);

      const document = await extractDocument({ bytes: made.bytes, filename: `${fixture.id}.pdf` });
      expect(document.kind).toBe("pdf");
      expect(document.pageCount).toBe(made.pageCount);
      expectWellFormed(document);
      expectGolden(document, fixture);

      const expected = made.pages.flatMap((page) => page.paragraphs.map((text) => ({ text, page: page.page })));
      expect(document.chunks.map(({ text, page }) => ({ text, page }))).toEqual(expected);
    });
  }

  it("nda: a last page holding only the one-line signature paragraphs still comes back as those paragraphs", async () => {
    // At 40 lines a page, the NDA's signature block lands alone on the last page with no wrapped line to
    // measure a line pitch from; the page is read against the document's pitch (pdf.ts, documentPitch).
    const nda = fixtures.find((fixture) => fixture.id === "nda")!;
    const made = makePdf(fixtureParagraphs(nda), { linesPerPage: 40 });
    const last = made.pages[made.pages.length - 1]!;
    expect(last.paragraphs.map((text) => text.split(" ").length <= 12)).toEqual([true, true, true, true]);

    const document = await extractDocument({ bytes: made.bytes, filename: "nda.pdf" });
    expectGolden(document, nda);
    expect(document.chunks.filter((chunk) => chunk.page === last.page).map((chunk) => chunk.text)).toEqual(last.paragraphs);
  });

  it("splits paragraphs on a single blank line and keeps wrapped lines together", async () => {
    const paragraphs = [
      "7.1 After confirmation, either party may terminate this employment by giving sixty (60) days' written notice, which is long enough to wrap across more than one line of the page.",
      "7.2 The Company may terminate your employment immediately, without notice, for misconduct.",
      "(a) a sub-clause that starts with a letter marker;",
    ];
    const document = await extractDocument({ bytes: makePdf(paragraphs).bytes, filename: "clauses.pdf" });
    expect(document.chunks.map((chunk) => chunk.text)).toEqual(paragraphs);
    expect(document.chunks.map((chunk) => chunk.page)).toEqual([1, 1, 1]);
  });

  it("detects paragraphs separated only by Word-style space-after (no blank line)", async () => {
    const paragraphs = fixtureParagraphs(fixtures[0]!).slice(7, 20);
    const made = makePdf(paragraphs, { separator: { spaceAfterPt: 6 } });
    const document = await extractDocument({ bytes: made.bytes, filename: "space-after.pdf" });
    expect(document.chunks.map((chunk) => chunk.text)).toEqual(paragraphs);
  });

  it("falls back to clause numbering when there is no vertical gap at all", async () => {
    const paragraphs = [
      "7. TERMINATION AFTER CONFIRMATION",
      "7.1 After confirmation, either party may terminate this employment by giving sixty (60) days' written notice.",
      "7.2 The Company may terminate your employment immediately, without notice, for misconduct, breach of policy or conviction of an offence.",
      "(a) return all Company property; and",
      "(b) settle any outstanding dues.",
    ];
    const made = makePdf(paragraphs, { separator: { spaceAfterPt: 0 } });
    const document = await extractDocument({ bytes: made.bytes, filename: "no-gap.pdf" });
    expect(document.chunks.map((chunk) => chunk.text)).toEqual(paragraphs);
  });

  it("refuses a password-protected PDF as encrypted", async () => {
    const error = await expectRefusal({ bytes: makeEncryptedPdf(), filename: "locked.pdf" }, "encrypted");
    expect(error.status).toBe(422);
    expect(error.message).toMatch(/password/i);
  });

  it("refuses a damaged PDF as malformed, without exposing the parser", async () => {
    const bytes = new Uint8Array(Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(2000, 0x41)]));
    const error = await expectRefusal({ bytes, filename: "broken.pdf" }, "malformed");
    expect(error.status).toBe(422);
    expect(error.message).not.toMatch(/pdf\.js|InvalidPDF|xref/i);
    expect(error.cause).toBeDefined();
  });

  it("refuses a PDF with no text layer (a scan) as no-text", async () => {
    await expectRefusal({ bytes: makeEmptyPdf(3), filename: "scan.pdf" }, "no-text");
  });

  it(`refuses more than ${MAX_PAGES} pages before reading any text`, async () => {
    const error = await expectRefusal({ bytes: makeEmptyPdf(MAX_PAGES + 1), filename: "long.pdf" }, "too-long");
    expect(error.status).toBe(413);
    expect(error.message).toContain(String(MAX_PAGES));
  });
});

describe("extractDocument: DOCX (generated from the fixtures)", () => {
  for (const fixture of fixtures) {
    it(`${fixture.id}: one chunk per Word paragraph, page null`, async () => {
      const paragraphs = fixtureParagraphs(fixture);
      const document = await extractDocument({ bytes: makeDocx(paragraphs), filename: `${fixture.id}.docx` });
      expect(document.kind).toBe("docx");
      expect(document.pageCount).toBeNull();
      expectWellFormed(document);
      expectGolden(document, fixture);
      expect(document.chunks.map((chunk) => chunk.text)).toEqual(paragraphs);
    });
  }

  it("drops empty Word paragraphs and keeps special characters", async () => {
    const document = await extractDocx(["Fee: ₹2,00,000 & <deposit>.", "", "   ", "Second."]);
    expect(document.chunks.map((chunk) => chunk.text)).toEqual(["Fee: ₹2,00,000 & <deposit>.", "Second."]);
  });

  it("refuses a truncated .docx as malformed", async () => {
    const whole = makeDocx(["Some paragraph.", "Another."]);
    const truncated = whole.subarray(0, whole.length - 30);
    await expectRefusal({ bytes: truncated, filename: "cut.docx" }, "malformed");
  });

  it("refuses an OLE container (.doc or password-protected) offered as .docx", async () => {
    const bytes = new Uint8Array(Buffer.concat([OLE_SIGNATURE, Buffer.alloc(512, 0)]));
    const error = await expectRefusal({ bytes, filename: "old.docx" }, "encrypted");
    expect(error.message).toMatch(/password|\.doc/i);
  });

  it("refuses a zip that is not a Word document", async () => {
    await expectRefusal({ bytes: zipStore([["hello.txt", "hi"]]), filename: "notword.docx" }, "format-mismatch");
  });
});

describe("extractDocument: type and size checks before parsing", () => {
  const pdfBytes = () => makePdf(["Some text that is long enough to count as readable content on the page."]).bytes;

  it("refuses unknown extensions and unknown MIME types", async () => {
    await expectRefusal({ bytes: pdfBytes(), filename: "malware.exe" }, "unsupported-format");
    await expectRefusal({ bytes: pdfBytes(), filename: "noext", mimeType: "application/octet-stream" }, "unsupported-format");
    await expectRefusal({ bytes: pdfBytes(), filename: "" }, "unsupported-format");
  });

  it("refuses contents that do not match the extension", async () => {
    await expectRefusal({ bytes: pdfBytes(), filename: "renamed.txt" }, "format-mismatch");
    await expectRefusal({ bytes: pdfBytes(), filename: "renamed.docx" }, "format-mismatch");
    await expectRefusal({ bytes: makeDocx(["x"]), filename: "renamed.pdf" }, "format-mismatch");
    await expectRefusal({ bytes: new Uint8Array([0, 1, 2, 3, 65, 66]), filename: "binary.txt" }, "format-mismatch");
    await expectRefusal({ bytes: new Uint8Array(200), filename: "zeros.pdf" }, "format-mismatch");
  });

  it("is case-insensitive about extensions", async () => {
    const document = await extractDocument({ bytes: pdfBytes(), filename: "UPPER.PDF" });
    expect(document.kind).toBe("pdf");
  });

  it(`refuses files over ${MAX_FILE_BYTES} bytes without looking inside`, async () => {
    const error = await expectRefusal({ bytes: new Uint8Array(MAX_FILE_BYTES + 1), filename: "huge.txt" }, "too-large");
    expect(error.status).toBe(413);
  });

  it("refuses a zero-byte file as empty whatever it is named, and a whitespace-only text file as no-text", async () => {
    await expectRefusal({ bytes: new Uint8Array(0), filename: "empty.txt" }, "empty");
    await expectRefusal({ bytes: new Uint8Array(0), filename: "empty.pdf" }, "empty");
    await expectRefusal({ bytes: new Uint8Array(0), filename: "empty.docx" }, "empty");
    await expectRefusal({ bytes: new Uint8Array(0), filename: "empty.rtf" }, "empty");
    await expectRefusal({ bytes: new Uint8Array(Buffer.from(" \n\n\t\n")), filename: "blank.txt" }, "no-text");
  });

  it("refuses text past the word cap as too-long", async () => {
    const words = Array.from({ length: 30_001 }, (_, i) => `w${i}`).join(" ");
    const error = await expectRefusal({ bytes: new Uint8Array(Buffer.from(words)), filename: "long.txt" }, "too-long");
    expect(error.message).toMatch(/pages/);
  });
});

async function extractDocx(paragraphs: string[]) {
  return extractDocument({ bytes: makeDocx(paragraphs), filename: "doc.docx" });
}
