import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { checkFile } from "./validate-file";
import { SAMPLES, loadSampleFile, type Sample } from "./samples";

/**
 * The sample picker on the upload screen: every manifest entry becomes the
 * same File a reader's own pick would (name, type, the committed bytes),
 * passes the same pre-flight check, and an entry whose text is not in the
 * bundle fails loudly instead of producing an empty document.
 */

const samplesDir = new URL("../../../../../samples/", import.meta.url);

describe("loadSampleFile", () => {
  it("turns every manifest entry into a text File holding exactly the committed sample", async () => {
    expect(SAMPLES.length).toBeGreaterThan(0);
    for (const sample of SAMPLES) {
      const file = await loadSampleFile(sample);
      expect(file, sample.id).toBeInstanceOf(File);
      expect(file.name, sample.id).toBe(sample.file);
      expect(file.type, sample.id).toBe("text/plain");
      const committed = await readFile(new URL(sample.file, samplesDir), "utf8");
      expect(await file.text(), sample.id).toBe(committed);
      expect(checkFile(file), sample.id).toEqual({ ok: true, kind: "txt" });
    }
  });

  it("fails, naming the file, when a manifest entry's text is not bundled", async () => {
    const missing: Sample = { ...SAMPLES[0], id: "missing", file: "not-a-bundled-sample.txt" };
    await expect(loadSampleFile(missing)).rejects.toThrow("Sample text not bundled: not-a-bundled-sample.txt");
  });

  it("matches a sample by its whole file name, not a suffix of another sample's", async () => {
    // `rental-agreement-synthetic.txt` must not be served for `agreement-synthetic.txt` or the like.
    const partial: Sample = { ...SAMPLES[0], id: "partial", file: "agreement-synthetic.txt" };
    await expect(loadSampleFile(partial)).rejects.toThrow("Sample text not bundled");
  });
});
