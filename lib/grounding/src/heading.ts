const MAX_HEADING_WORDS = 12;
/** A full stop, question or exclamation mark, or danda after a letter: the text is a sentence, not a title. */
const SENTENCE_END = /\p{L}[.!?।](?:\s|$)/u;

/**
 * Short, fully upper-case paragraphs ("4. LOCK-IN PERIOD AND TERMINATION",
 * "BETWEEN", "IT IS AGREED AS FOLLOWS:") are headings, not clauses: the rule
 * engine does not match them and the retriever does not rank them, since a
 * heading names a section but never answers a question. Text with any
 * lower-case letter is never a heading, and text in a script without letter
 * case (Devanagari, for instance) is never a heading either: it has no
 * upper-case letters to qualify on. An upper-case sentence ("NO PETS ARE
 * ALLOWED.") is a clause that happens to shout, and stays a clause.
 */
export function isHeading(text: string): boolean {
  const trimmed = text.trim();
  if (!/\p{Lu}/u.test(trimmed) || /\p{Ll}/u.test(trimmed)) return false;
  if (SENTENCE_END.test(trimmed)) return false;
  return trimmed.split(/\s+/).length <= MAX_HEADING_WORDS;
}
