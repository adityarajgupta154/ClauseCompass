import { describe, expect, it } from "vitest";
import { makeDocx, zipStore } from "../testing/make-docx";
import { extractDocument } from "./index";
import { MAX_DOCX_ENTRIES, MAX_DOCX_UNPACKED_BYTES } from "./limits";
import { measureZip } from "./zip";

const budget = { maxEntries: MAX_DOCX_ENTRIES, maxUnpackedBytes: MAX_DOCX_UNPACKED_BYTES };

/** Rewrites the declared uncompressed size of every central-directory entry — what a forged archive does. */
function declareUnpackedSize(zip: Uint8Array, size: number): Uint8Array {
  const patched = new Uint8Array(zip);
  const view = new DataView(patched.buffer, patched.byteOffset, patched.byteLength);
  let found = 0;
  for (let offset = 0; offset + 4 <= patched.length; offset++) {
    if (view.getUint32(offset, true) === 0x02014b50) {
      view.setUint32(offset + 24, size, true);
      found += 1;
    }
  }
  if (found === 0) throw new Error("no central directory entry found");
  return patched;
}

/** A deflated entry that is tiny on disk and `bytes` long when inflated. */
function bombEntry(bytes: number, name = "word/media/image1.bin"): [string, Buffer] {
  return [name, Buffer.alloc(bytes, 0)];
}

/** Rewrites the entry count in the end-of-central-directory record. */
function declareEntryCount(zip: Uint8Array, count: number): Uint8Array {
  const patched = new Uint8Array(zip);
  const view = new DataView(patched.buffer, patched.byteOffset, patched.byteLength);
  for (let offset = patched.length - 22; offset >= 0; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      view.setUint16(offset + 8, count, true);
      view.setUint16(offset + 10, count, true);
      return patched;
    }
  }
  throw new Error("no end-of-central-directory record found");
}

/** Bytes before the archive, as a self-extracting stub would have. */
function withPrefix(zip: Uint8Array, prefix: number): Uint8Array {
  return new Uint8Array(Buffer.concat([Buffer.alloc(prefix, 0x2e), zip]));
}

describe("measureZip", () => {
  it("measures entries and inflated bytes for stored and deflated archives", () => {
    const entries: Array<[string, string]> = [
      ["a.txt", "hello"],
      ["dir/b.txt", "hello world"],
    ];
    expect(measureZip(zipStore(entries), budget)).toEqual({ result: "within", entries: 2, unpackedBytes: 16 });
    expect(measureZip(zipStore(entries, { deflate: true }), budget)).toEqual({ result: "within", entries: 2, unpackedBytes: 16 });
  });

  it("does not trust declared sizes: a deflated entry declared as 1 byte is still measured by inflating it", () => {
    const forged = declareUnpackedSize(zipStore([bombEntry(3 * 1024 * 1024)], { deflate: true }), 1);
    expect(forged.byteLength).toBeLessThan(10_000);
    expect(measureZip(forged, budget)).toEqual({ result: "within", entries: 1, unpackedBytes: 3 * 1024 * 1024 });
    expect(measureZip(forged, { ...budget, maxUnpackedBytes: 1024 * 1024 })).toEqual({ result: "over" });
  });

  it("stops at the budget across entries, not just per entry", () => {
    const zip = zipStore([["a.bin", Buffer.alloc(600, 1)], ["b.bin", Buffer.alloc(600, 2)]], { deflate: true });
    expect(measureZip(zip, { ...budget, maxUnpackedBytes: 1000 })).toEqual({ result: "over" });
    expect(measureZip(zip, { ...budget, maxUnpackedBytes: 1200 })).toMatchObject({ result: "within", unpackedBytes: 1200 });
  });

  it("refuses more entries than the budget allows without opening them", () => {
    const zip = zipStore([["a", "1"], ["b", "2"], ["c", "3"]]);
    expect(measureZip(zip, { ...budget, maxEntries: 2 })).toEqual({ result: "over" });
  });

  it("measures every entry the zip reader would open, not the count the archive declares", () => {
    const zip = zipStore([["a.txt", "tiny"], bombEntry(2 * 1024 * 1024, "word/document.xml")], { deflate: true });
    const underCounted = declareEntryCount(zip, 1);
    expect(measureZip(underCounted, { ...budget, maxUnpackedBytes: 1024 * 1024 })).toEqual({ result: "over" });
    expect(measureZip(underCounted, budget)).toEqual({ result: "within", entries: 2, unpackedBytes: 2 * 1024 * 1024 + 4 });
    expect(measureZip(declareEntryCount(zip, 9), budget)).toMatchObject({ result: "within", entries: 2 });
  });

  it("follows shifted offsets when bytes precede the archive, as the zip reader does", () => {
    const zip = zipStore([["a.txt", "hello"], bombEntry(2 * 1024 * 1024)], { deflate: true });
    const prefixed = withPrefix(zip, 1000);
    expect(measureZip(prefixed, budget)).toEqual({ result: "within", entries: 2, unpackedBytes: 2 * 1024 * 1024 + 5 });
    expect(measureZip(prefixed, { ...budget, maxUnpackedBytes: 1024 * 1024 })).toEqual({ result: "over" });
  });

  it("reports data with no central directory, or a damaged one, as unreadable", () => {
    expect(measureZip(new Uint8Array(Buffer.from("PK\u0003\u0004 not really a zip")), budget)).toEqual({ result: "unreadable" });
    expect(measureZip(new Uint8Array(10), budget)).toEqual({ result: "unreadable" });
    const truncated = zipStore([["a.txt", "hello"]]).slice(0, -1);
    expect(measureZip(truncated, budget)).toEqual({ result: "unreadable" });
    // A directory that claims to extend past the end of the file.
    const zip = zipStore([["a.txt", "hello"]]);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    view.setUint32(zip.length - 22 + 12, 10_000, true);
    expect(measureZip(zip, budget)).toEqual({ result: "unreadable" });
  });

  it("treats a ZIP64 entry size marker as over any budget", () => {
    const zip = declareUnpackedSize(zipStore([["a.txt", "x"]]), 0xffffffff);
    // The uncompressed marker alone is not consulted; force the compressed-size marker too.
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    for (let offset = 0; offset + 4 <= zip.length; offset++) {
      if (view.getUint32(offset, true) === 0x02014b50) view.setUint32(offset + 20, 0xffffffff, true);
    }
    expect(measureZip(zip, budget)).toEqual({ result: "over" });
  });

  it("refuses every end-record field that would send the zip reader to a separate ZIP64 directory", () => {
    const base = zipStore([["a.txt", "x"]]);
    const eocd = base.length - 22;
    for (const field of [4, 6, 8, 10]) {
      const zip = new Uint8Array(base);
      new DataView(zip.buffer, zip.byteOffset, zip.byteLength).setUint16(eocd + field, 0xffff, true);
      expect(measureZip(zip, budget), `16-bit field at +${field}`).toEqual({ result: "over" });
    }
    for (const field of [12, 16]) {
      const zip = new Uint8Array(base);
      new DataView(zip.buffer, zip.byteOffset, zip.byteLength).setUint32(eocd + field, 0xffffffff, true);
      expect(measureZip(zip, budget), `32-bit field at +${field}`).toEqual({ result: "over" });
    }
    expect(measureZip(base, budget)).toMatchObject({ result: "within" });
  });
});

describe("extractDocx decompression budget", () => {
  it("refuses a .docx that inflates past the budget even though it declares tiny sizes", async () => {
    const bomb = declareUnpackedSize(makeDocx(["A perfectly ordinary paragraph."], { deflate: true, extraEntries: [bombEntry(MAX_DOCX_UNPACKED_BYTES + 1)] }), 1);
    expect(bomb.byteLength).toBeLessThan(100_000);
    await expect(extractDocument({ bytes: bomb, filename: "bomb.docx" })).rejects.toMatchObject({
      code: "too-large",
      status: 413,
      message: expect.stringMatching(/expands to far more/),
    });
  });

  it("refuses a .docx whose oversized word/document.xml hides behind an under-counted directory", async () => {
    const paragraphs = Array.from({ length: 200 }, () => "x".repeat(4000));
    const docx = makeDocx(paragraphs, { deflate: true, extraEntries: [bombEntry(MAX_DOCX_UNPACKED_BYTES, "word/media/fill.bin")] });
    const bomb = declareUnpackedSize(declareEntryCount(docx, 1), 1);
    await expect(extractDocument({ bytes: bomb, filename: "bomb.docx" })).rejects.toMatchObject({ code: "too-large", status: 413 });
  });

  it("never hands a ZIP64-flagged .docx to the zip reader, whichever field carries the flag", async () => {
    for (const field of [4, 6, 8, 10]) {
      const docx = makeDocx(["A perfectly ordinary paragraph."]);
      new DataView(docx.buffer, docx.byteOffset, docx.byteLength).setUint16(docx.length - 22 + field, 0xffff, true);
      await expect(extractDocument({ bytes: docx, filename: "z64.docx" })).rejects.toMatchObject({ code: "too-large", status: 413 });
    }
  });

  it("refuses an archive it cannot measure instead of letting the zip reader guess", async () => {
    const docx = makeDocx(["A perfectly ordinary paragraph."]);
    const view = new DataView(docx.buffer, docx.byteOffset, docx.byteLength);
    view.setUint32(docx.length - 22 + 16, 7, true); // central directory offset pointing into nonsense
    await expect(extractDocument({ bytes: docx, filename: "odd.docx" })).rejects.toMatchObject({ code: "malformed", status: 422 });
  });

  it("lets a normal deflated .docx through", async () => {
    const document = await extractDocument({ bytes: makeDocx(["A perfectly ordinary paragraph."], { deflate: true }), filename: "ok.docx" });
    expect(document.chunks).toHaveLength(1);
  });
});
