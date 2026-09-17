import { describe, expect, it } from "vitest";
import type { SourceChunk } from "@workspace/grounding";
import { loadFixtures } from "../testing/fixtures";
import { toSourceChunks } from "./chunks";
import { findPartyChunks } from "./parties";
import { splitParagraphs } from "../extraction/paragraphs";

function chunksOf(text: string): SourceChunk[] {
  return toSourceChunks({
    chunks: splitParagraphs(text).map((paragraph, index) => ({ text: paragraph, page: null, paragraphIndex: index + 1 })),
  });
}

function fixtureChunks(id: string): SourceChunk[] {
  const fixture = loadFixtures().find((entry) => entry.id === id);
  if (!fixture) throw new Error(`no fixture ${id}`);
  return chunksOf(fixture.text);
}

const startsWith = (chunks: SourceChunk[], prefix: string) =>
  chunks.map((chunk) => chunk.text.slice(0, prefix.length)).filter((text) => text === prefix);

describe("findPartyChunks on the fixtures", () => {
  it("rental agreement: the two paragraphs after BETWEEN and AND that define Licensor and Licensee", () => {
    const found = findPartyChunks(fixtureChunks("rental-agreement"));
    expect(found.map((mention) => mention.chunk.text.slice(0, 20))).toEqual(["Mr. Devraj Kulkarni,", "Mr. Imran Qureshi, a"]);
    expect(found.every((mention) => mention.weight === 3)).toBe(true);
    expect(found.map((mention) => mention.chunk.text.slice(mention.match.start, mention.match.end))).toEqual([
      "hereinafter called",
      "hereinafter called",
    ]);
  });

  it("NDA: the Disclosing Party and Receiving Party definitions", () => {
    const found = findPartyChunks(fixtureChunks("nda"));
    expect(found.map((mention) => mention.chunk.text.slice(mention.match.start, mention.match.end))).toEqual([
      '(the "Disclosing Party")',
      '(the "Receiving Party")',
    ]);
  });

  it("offer letter: the company's defined term first, then the addressee block and the acceptance line", () => {
    const found = findPartyChunks(fixtureChunks("offer-letter"));
    expect(found.map((mention) => [mention.weight, mention.chunk.text.slice(0, 14)])).toEqual([
      [3, "Further to you"],
      [1, "Ms. Aarohi Men"],
      [1, "I, Aarohi Meno"],
    ]);
  });
});

describe("findPartyChunks cues", () => {
  it("does not treat headings, the agreement's own defined term or a plain mention of a company as a party", () => {
    const chunks = chunksOf(
      [
        "LEAVE AND LICENCE AGREEMENT",
        'This Agreement ("Agreement") is dated today.',
        "The Company will review pay every April.",
        "BETWEEN",
      ].join("\n\n"),
    );
    expect(findPartyChunks(chunks)).toEqual([]);
  });

  it("takes the paragraph after a BETWEEN or AND heading even without a defined term", () => {
    const chunks = chunksOf(["BETWEEN", "Sunrise Traders, Pune.", "AND", "Meera Joshi, Nashik.", "Other text."].join("\n\n"));
    const found = findPartyChunks(chunks);
    expect(found.map((mention) => mention.chunk.id)).toEqual(["p2", "p4"]);
    expect(found.map((mention) => mention.weight)).toEqual([2, 2]);
    expect(startsWith(chunks, "Other")).toHaveLength(1);
  });

  it("keeps at most four paragraphs, strongest cue first", () => {
    const paragraphs = ["BETWEEN", "First Co, Pune.", "AND", "Second Co, Pune."];
    for (let i = 0; i < 5; i += 1) paragraphs.push(`Party ${i} Pvt Ltd (the "Contractor") agrees.`);
    const found = findPartyChunks(chunksOf(paragraphs.join("\n\n")));
    expect(found).toHaveLength(4);
    expect(found.every((mention) => mention.weight === 3)).toBe(true);
  });
});
