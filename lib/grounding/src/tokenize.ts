import { SPELLINGS, STOPWORD_LISTS } from "./tokenize-data";
import { stem } from "./stem";

export { SPELLINGS } from "./tokenize-data";

/**
 * Text → index terms. Lowercase, NFKC-normalised, apostrophes removed
 * ("don't" → dont, "Licensee's" → licensees), digit groups joined ("18,000" →
 * 18000), split on anything that is not a letter, mark or digit (so
 * "lock-in" is "lock" + "in" and Devanagari words keep their vowel signs),
 * single characters dropped unless they are digits, over-long tokens dropped, American
 * spellings folded onto the British form, then Porter-stemmed. Stopwords are
 * removed from queries but not from documents: a document term that is never
 * asked for costs nothing, while a query is short and every remaining word
 * should mean something.
 */

const TOKEN = /[\p{L}\p{M}\p{N}]+/gu;
/** "18,000" and "2,00,000" are one number, however the commas fall. */
const DIGIT_GROUP_COMMA = /(?<=\p{N}),(?=\p{N})/gu;
/** Straight, curly and modifier apostrophes: "don't" is one word, "Licensee's" is "licensees". */
const APOSTROPHE = /['\u2019\u02BC]/gu;
/**
 * No word in a contract is this long; anything longer is a run of pasted
 * garbage (a base64 blob, a URL with no separators) that would only cost time
 * to stem and could never be asked for.
 */
export const MAX_TOKEN_LENGTH = 64;

/** The normal form every token is in: NFKC (so precomposed nukta letters decompose the same way everywhere) and lowercase. */
export function normalizeText(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

export const STOPWORDS: ReadonlySet<string> = new Set(
  STOPWORD_LISTS.flatMap((words) => words.map(normalizeText)),
);

export function isStopword(token: string): boolean {
  return STOPWORDS.has(token);
}

/** Lowercased surface tokens in order; nothing removed but punctuation and single letters. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  const prepared = normalizeText(text).replace(APOSTROPHE, "").replace(DIGIT_GROUP_COMMA, "");
  for (const match of prepared.matchAll(TOKEN)) {
    const token = match[0];
    if (token.length > MAX_TOKEN_LENGTH) continue;
    if (token.length > 1 || /^\p{N}$/u.test(token)) out.push(token);
  }
  return out;
}

/** The index term for a surface token: spelling folded, then stemmed. */
export function termOf(token: string): string {
  return stem(SPELLINGS[token] ?? token);
}

/** Index terms for a text, stopwords kept (documents). */
export function analyzeDocument(text: string): string[] {
  return tokenize(text).map(termOf);
}
