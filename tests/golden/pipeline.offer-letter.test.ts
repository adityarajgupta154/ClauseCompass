import { describe, expect, it } from "vitest";
import { OFFER_LETTER, expectMap, expectReview, run, withoutPages } from "./pipeline.helpers";

const golden = OFFER_LETTER;

  describe(`${golden.id} (${golden.stage})`, () => {
    // The committed text is the reference the other two formats are held to; run once, shared.
    let asText: ReturnType<typeof run> | undefined;
    const reference = () => (asText ??= run(golden, "txt"));

    it("as the committed text: every field, date and prompt points at the paragraph the table says", async () => {
      const result = await reference();
      expectMap(result.map, golden, result.rendering);
      expectReview(result.review, golden, result.rendering);
    });

    for (const format of ["pdf", "docx"] as const) {
      it(`as ${format.toUpperCase()}: reads the same, ${format === "pdf" ? "with the page each paragraph was printed on" : "with no pages"}`, async () => {
        const [result, text] = await Promise.all([run(golden, format), reference()]);
        expectMap(result.map, golden, result.rendering);
        expectReview(result.review, golden, result.rendering);
        const { document: _m, ...mapRest } = result.map;
        const { document: _r, ...reviewRest } = result.review;
        const { document: _rm, ...refMap } = text.map;
        const { document: _rr, ...refReview } = text.review;
        expect(withoutPages(mapRest)).toEqual(withoutPages(refMap));
        expect(withoutPages(reviewRest)).toEqual(withoutPages(refReview));
      });
    }
  });
