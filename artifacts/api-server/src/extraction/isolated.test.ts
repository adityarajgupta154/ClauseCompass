import { describe, expect, it } from "vitest";
import { loadFixtures } from "../testing/fixtures";
import { makePdf } from "../testing/make-pdf";
import { extractDocument } from "./index";
import { extractDocumentIsolated } from "./isolated";

/**
 * The worker path must give exactly what the in-process path gives, carry
 * refusals across the thread boundary intact, and turn a worker that will
 * not finish into a `too-complex` refusal instead of a hung request.
 */
describe("extractDocumentIsolated", () => {
  const [fixture] = loadFixtures();

  it("returns the same document as the in-process extractor", async () => {
    const bytes = fixture!.bytes;
    const [direct, isolated] = await Promise.all([
      extractDocument({ bytes, filename: "a.txt" }),
      extractDocumentIsolated({ bytes, filename: "a.txt" }),
    ]);
    expect(isolated).toEqual(direct);
    expect(isolated.chunks).toHaveLength(fixture!.golden.paragraphCount);
  });

  it("rebuilds an ExtractionError with its code, status, message and cause category", async () => {
    const corrupt = new Uint8Array(Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(2000, 7)]));
    const error = await extractDocumentIsolated({ bytes: corrupt, filename: "x.pdf" }).catch((err: unknown) => err);
    expect(error).toMatchObject({ name: "ExtractionError", code: "malformed", status: 422, message: expect.stringMatching(/could not be read/) });
    expect((error as Error).cause).toBeInstanceOf(Error);
  });

  it("stops a parse that exceeds the deadline and reports it as too-complex", async () => {
    const { bytes } = makePdf(Array.from({ length: 200 }, (_, i) => `Paragraph ${i} with enough words to make the page take a moment to lay out.`));
    await expect(extractDocumentIsolated({ bytes, filename: "slow.pdf" }, { timeoutMs: 1 })).rejects.toMatchObject({
      code: "too-complex",
      status: 422,
      message: expect.stringMatching(/time and memory/),
    });
  });

  it("does not let the file's bytes be changed under the caller", async () => {
    const bytes = new Uint8Array(Buffer.from("Hello there, this is a short but sufficient text document for extraction.\n"));
    const before = Buffer.from(bytes).toString("hex");
    await extractDocumentIsolated({ bytes, filename: "a.txt" });
    expect(Buffer.from(bytes).toString("hex")).toBe(before);
    expect(bytes.byteLength).toBeGreaterThan(0);
  });
});
