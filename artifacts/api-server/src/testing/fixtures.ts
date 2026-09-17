import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The synthetic fixture documents from `samples/` and their human-checked
 * expectations from `samples/golden.json`, for the extraction tests.
 */

const SAMPLES_DIR = fileURLToPath(new URL("../../../../samples/", import.meta.url));

interface ManifestEntry {
  id: string;
  file: string;
  title: string;
}

export interface GoldenAnchor {
  paragraphIndex: number;
  startsWith: string;
}

export interface GoldenExpectation {
  paragraphCount: number;
  wordCount: number;
  anchors: GoldenAnchor[];
}

export interface Fixture {
  id: string;
  title: string;
  /** The .txt fixture exactly as committed. */
  bytes: Uint8Array;
  text: string;
  golden: GoldenExpectation;
}

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(`${SAMPLES_DIR}${name}`, "utf8")) as T;
}

export function loadFixtures(): Fixture[] {
  const manifest = readJson<{ samples: ManifestEntry[] }>("manifest.json");
  const golden = readJson<Record<string, GoldenExpectation | string>>("golden.json");
  return manifest.samples.map((entry) => {
    const expectation = golden[entry.id];
    if (!expectation || typeof expectation === "string") {
      throw new Error(`samples/golden.json has no expectations for fixture "${entry.id}"`);
    }
    const bytes = new Uint8Array(readFileSync(`${SAMPLES_DIR}${entry.file}`));
    return {
      id: entry.id,
      title: entry.title,
      bytes,
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      golden: expectation,
    };
  });
}

/**
 * The fixture's paragraphs as a plain array — the input handed to the PDF
 * and DOCX writers so that a round trip can be checked against exactly what
 * went in. Blank-line separated, whitespace collapsed; independent of the
 * extractor's own splitter on purpose.
 */
export function fixtureParagraphs(fixture: Fixture): string[] {
  return fixture.text
    .split(/\n\s*\n/)
    .map((block) => block.split(/\s+/).filter(Boolean).join(" "))
    .filter((block) => block.length > 0);
}
