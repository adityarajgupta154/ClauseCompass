import { describe, expect, it } from "vitest";
import { COMPARE, api, chunkByLabel, expectDocument, expectGrounded, labelOf, labelsOf, render, withoutPages } from "./pipeline.helpers";
import type { CompareResponse, CompareSide, Format, Rendering } from "./pipeline.helpers";
import { openSession, prepare } from "../support/api-server";

describe("rental agreement against its second draft (compare-versions)", () => {
  async function runCompare(format: Format) {
    const older = render(COMPARE.older.file, format);
    const newer = render(COMPARE.newer.file, format);
    const id = await openSession(api.baseUrl, "compare-versions", { fileName: older.fileName, bytes: older.bytes }, { fileName: newer.fileName, bytes: newer.bytes });
    const compare = await prepare(api.baseUrl, id, "compare");
    expect(compare.status).toBe(200);
    return { id, older, newer, compare: JSON.parse(compare.body) as CompareResponse };
  }

  function expectCompare(body: CompareResponse, older: Rendering, newer: Rendering) {
    expectDocument(body.older.document, COMPARE.older, older);
    expectDocument(body.newer.document, COMPARE.newer, newer);
    expect([body.aligned, body.unchanged, body.byKind]).toEqual([COMPARE.aligned, COMPARE.unchanged, COMPARE.byKind]);

    const side = (chunks: Chunk[], rendering: Rendering, at: CompareSide | null) => {
      if (at === null) return null;
      const chunk = chunks.find((candidate) => candidate.id === at.chunkId);
      expect(chunk).toBeDefined();
      expect(at.location).toEqual(chunk!.location);
      expect(at.location.page).toBe(rendering.pageOf(at.location.paragraph));
      // The excerpt shown is the paragraph itself, in pieces.
      expect(at.segments.map((segment) => segment.text).join("")).toBe(chunk!.text);
      return [labelOf(chunk!), at.location.paragraph] as [string, number];
    };
    const words = (at: CompareSide | null) => (at === null ? null : at.segments.filter((segment) => segment.changed).map((segment) => segment.text.trim()));

    expect(
      body.changes.map((change) => ({
        id: change.id,
        status: change.status,
        kind: change.kind,
        signals: change.signals,
        older: side(body.older.chunks, older, change.older),
        newer: side(body.newer.chunks, newer, change.newer),
        values: change.values,
        olderWords: words(change.older),
        newerWords: words(change.newer),
      })),
    ).toEqual(COMPARE.changes);
  }

  it("finds the seven differences, each at its paragraph in both drafts, with the amounts and periods as written", async () => {
    const { id, older, newer, compare } = await runCompare("txt");
    expectCompare(compare, older, newer);

    // The map for this journey is built from the newer draft, at the compare stage.
    const map = await prepare(api.baseUrl, id, "document-map");
    expect(map.status).toBe(200);
    const body = JSON.parse(map.body) as MapResponse;
    expectDocument(body.document, COMPARE.newer, newer);
    expect(Object.fromEntries(body.map.fields.map((field) => [field.id, labelsOf(body.chunks, field.evidence)]))).toEqual(COMPARE.newerEvidence);
    for (const [label, paragraph] of Object.entries(COMPARE.newerParagraphs)) expect(chunkByLabel(body.chunks, label).location.paragraph, label).toBe(paragraph);
    for (const field of body.map.fields) for (const claim of field.claims) expectGrounded(claim, body.chunks);
  });

  it("as two PDFs: the same differences, each side on the page it was printed on", async () => {
    const asText = await runCompare("txt");
    const asPdf = await runCompare("pdf");
    expectCompare(asPdf.compare, asPdf.older, asPdf.newer);
    const { older: _o, newer: _n, ...pdfRest } = asPdf.compare;
    const { older: _to, newer: _tn, ...textRest } = asText.compare;
    expect(withoutPages(pdfRest)).toEqual(withoutPages(textRest));
    expect(asPdf.compare.changes.map((change) => [change.older?.location.page ?? null, change.newer?.location.page ?? null])).toEqual([
      [2, 2],
      [2, 2],
      [2, null],
      [3, 3],
      [3, 3],
      [3, 3],
      [null, 3],
    ]);
  });
});
