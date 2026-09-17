import { describe, expect, it } from "vitest";
import { copy } from "@/features/journey/copy";
import { MAX_FILE_BYTES } from "./constants";
import { checkFile, type FileLike } from "./validate-file";

/**
 * The browser-side pre-flight for a picked or dropped file (FR-01): which
 * files go through, which are refused before any upload, and that each
 * refusal carries the sentence written for it. Type comes before size, so a
 * huge photo hears about photos, not about size. The server re-checks all
 * of this against the bytes; this is the first, cheaper answer.
 */

const file = (name: string, type = "", size = 1024): FileLike => ({ name, type, size });

describe("checkFile: accepted kinds", () => {
  it("accepts PDF, DOCX and TXT by extension, whatever the browser says the type is", () => {
    expect(checkFile(file("offer.pdf", "application/pdf"))).toEqual({ ok: true, kind: "pdf" });
    expect(checkFile(file("Lease Agreement.DOCX", ""))).toEqual({ ok: true, kind: "docx" });
    expect(checkFile(file("notes.txt", "application/octet-stream"))).toEqual({ ok: true, kind: "txt" });
  });

  it("falls back to the reported type only when the name has no extension", () => {
    expect(checkFile(file("offer", "application/pdf"))).toEqual({ ok: true, kind: "pdf" });
    expect(checkFile(file("README", "text/plain"))).toEqual({ ok: true, kind: "txt" });
    expect(checkFile(file(".hidden", "text/plain"))).toEqual({ ok: true, kind: "txt" });
    expect(checkFile(file("offer", "application/octet-stream"))).toMatchObject({ ok: false, code: "unsupported-type" });
  });

  it("does not let a type override a known-wrong extension", () => {
    expect(checkFile(file("offer.exe", "application/pdf"))).toMatchObject({ ok: false, code: "unsupported-type" });
  });
});

describe("checkFile: refusals", () => {
  it("names the extension it does not take, or says so plainly when there is none", () => {
    expect(checkFile(file("offer.rtf"))).toEqual({ ok: false, code: "unsupported-type", message: copy.upload.errors.unsupported("rtf") });
    expect(checkFile(file("offer."))).toEqual({ ok: false, code: "unsupported-type", message: copy.upload.errors.unsupported(null) });
  });

  it("sends a legacy .doc to Word, not to the generic message", () => {
    expect(checkFile(file("offer.doc", "application/msword"))).toEqual({ ok: false, code: "legacy-doc", message: copy.upload.errors.legacyDoc });
  });

  it("treats photos and scans by extension or by type as images, before looking at size", () => {
    for (const name of ["scan.jpg", "scan.JPEG", "page.png", "page.heic", "page.tiff", "page.webp"]) {
      expect(checkFile(file(name, "", MAX_FILE_BYTES * 5)), name).toEqual({ ok: false, code: "image", message: copy.upload.errors.image });
    }
    expect(checkFile(file("scan", "image/png"))).toMatchObject({ ok: false, code: "image" });
    // A document extension on an image's bytes, as the browser reports it: still a photo.
    expect(checkFile(file("scan.pdf", "image/jpeg"))).toMatchObject({ ok: false, code: "image" });
  });

  it("refuses a document name on an audio or video type as a mismatch", () => {
    expect(checkFile(file("offer.pdf", "video/mp4"))).toEqual({
      ok: false,
      code: "media-mismatch",
      message: copy.upload.errors.mediaMismatch("pdf"),
    });
    expect(checkFile(file("offer", "audio/mpeg"))).toMatchObject({ ok: false, code: "unsupported-type" });
  });

  it("refuses an empty file and one over the limit, stating the size and the limit", () => {
    expect(checkFile(file("offer.pdf", "application/pdf", 0))).toEqual({ ok: false, code: "empty", message: copy.upload.errors.empty });
    expect(checkFile(file("offer.pdf", "application/pdf", MAX_FILE_BYTES))).toEqual({ ok: true, kind: "pdf" });
    const over = checkFile(file("offer.pdf", "application/pdf", 12 * 1024 * 1024));
    expect(over).toEqual({ ok: false, code: "too-large", message: copy.upload.errors.tooLarge("12.0 MB", "10 MB") });
    expect((over as { message: string }).message).toContain("This file is 12.0 MB. The limit is 10 MB.");
  });

  it("never throws, whatever the name or type", () => {
    for (const odd of [file(""), file(".", ""), file("..", ""), file("a.b.c.d"), file("x".repeat(5000) + ".pdf", "\u0000")]) {
      expect(() => checkFile(odd)).not.toThrow();
    }
  });
});
