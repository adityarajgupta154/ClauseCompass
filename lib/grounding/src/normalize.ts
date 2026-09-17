/**
 * Text as compared for quote containment and for the language check:
 * Unicode-normalised, lower case, typographic quotes and dashes folded to
 * ASCII, invisible characters gone, whitespace collapsed. Applied to the
 * quote and the chunk alike, so a curly apostrophe in a Word document and
 * a straight one from the model compare equal.
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201a\u201b\u2032\u02bc]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u200b-\u200d\u2060\ufeff\u00ad]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
