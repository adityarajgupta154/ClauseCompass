import { describe, expect, it } from "vitest";
import { fileNameProblem, MAX_FILE_NAME_CHARS, safeFileName } from "./file-name";

describe("fileNameProblem", () => {
  it("refuses anything that reads as a path, whichever separator it uses", () => {
    for (const name of [
      "../../etc/passwd",
      "..\\..\\windows\\system32\\config\\sam",
      "/etc/passwd.txt",
      "C:\\Users\\me\\Desktop\\lease.pdf",
      "lease.txt/../../etc/passwd",
      "folder/",
      "..",
      ".",
      " .. ",
      ".\u202e",
      "..\u202e",
      ".\u200b.",
      "\ufeff..",
    ]) {
      expect(fileNameProblem(name), JSON.stringify(name)).toBe("path");
    }
  });

  it("refuses control characters, including the ones multer decodes back out of a header", () => {
    for (const name of ["passwd.txt\u0000.pdf", "lease\n.txt", "lease\r\n.txt", "pass\twd.txt", "a\u0007b.txt", "lease\u009f.pdf"]) {
      expect(fileNameProblem(name), JSON.stringify(name)).toBe("control");
    }
  });

  it("refuses a name longer than any file system allows, and one with nothing in it", () => {
    expect(fileNameProblem("x".repeat(256) + ".pdf")).toBe("too-long");
    expect(fileNameProblem("")).toBe("empty");
    expect(fileNameProblem("   ")).toBe("empty");
    expect(fileNameProblem("\u202e\u200e")).toBe("empty");
  });

  it("passes the names people actually have", () => {
    for (const name of [
      "lease.pdf",
      "Rental Agreement (final) v2.docx",
      "किराया-समझौता.pdf",
      "offer letter – 2026.txt",
      "x".repeat(200) + ".txt",
      "<img src=x onerror=alert(1)>.txt",
      "..%2f..%2fetc%2fpasswd.txt",
      "...leading-dots.pdf",
      "no-extension",
    ]) {
      expect(fileNameProblem(name), name).toBeNull();
    }
  });
});

describe("safeFileName", () => {
  it("keeps an ordinary name as it is, Unicode included, joiners and all", () => {
    expect(safeFileName("lease.pdf")).toBe("lease.pdf");
    expect(safeFileName("किराया-समझौता.pdf")).toBe("किराया-समझौता.pdf");
    // ZWNJ shapes the conjunct here; stripping it would change how the name reads.
    expect(safeFileName("श्री\u200cराम.pdf")).toBe("श्री\u200cराम.pdf");
    expect(safeFileName("<img src=x onerror=alert(1)>.txt")).toBe("<img src=x onerror=alert(1)>.txt");
  });

  it("collapses whitespace and drops control and direction-override characters", () => {
    expect(safeFileName("  my   lease\t(final)  .txt ")).toBe("my lease (final) .txt");
    expect(safeFileName("lease\u202etxt.pdf")).toBe("leasetxt.pdf");
    expect(safeFileName("\u200fnotice\u200e.txt")).toBe("notice.txt");
    expect(safeFileName("word\u2060joiner.txt")).toBe("wordjoiner.txt");
    expect(safeFileName("a\u0007b.txt")).toBe("ab.txt");
  });

  it("caps the length while keeping the extension, so what is shown is what was checked", () => {
    const capped = safeFileName("x".repeat(300) + ".pdf");
    expect(capped).toHaveLength(MAX_FILE_NAME_CHARS);
    expect(capped.endsWith(".pdf")).toBe(true);
    expect(safeFileName("y".repeat(300))).toHaveLength(MAX_FILE_NAME_CHARS);
  });

  it("still takes the last path segment and falls back to a plain word, as a second line behind the check", () => {
    expect(safeFileName("C:\\Users\\me\\Desktop\\lease.pdf")).toBe("lease.pdf");
    expect(safeFileName("/home/me/docs/offer letter.docx")).toBe("offer letter.docx");
    expect(safeFileName("")).toBe("document");
    expect(safeFileName("\u0000\u0001")).toBe("document");
    expect(safeFileName("folder/")).toBe("document");
  });
});
