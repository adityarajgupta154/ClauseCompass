/**
 * Porter stemmer (M.F. Porter, 1980), implemented as written so that "notice",
 * "notices" and "noticed" — or "terminate", "terminated" and "termination" —
 * index under one term. Only lowercase ASCII words of three letters or more
 * are stemmed; numbers and non-Latin words (Devanagari) are returned as they
 * are. A pure function with no tables to load.
 */

/**
 * Porter's consonant flags for a word, one forward pass: a, e, i, o, u are
 * vowels; "y" is a consonant at the start of a word or after a vowel and a
 * vowel after a consonant; everything else is a consonant. Computed once per
 * question rather than per letter, so a pathological "yyyy…" token costs
 * linear time.
 */
function consonants(word: string): boolean[] {
  const flags: boolean[] = new Array<boolean>(word.length);
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    if (ch === "a" || ch === "e" || ch === "i" || ch === "o" || ch === "u") flags[i] = false;
    else if (ch === "y") flags[i] = i === 0 ? true : !flags[i - 1]!;
    else flags[i] = true;
  }
  return flags;
}

/** Number of vowel–consonant sequences, Porter's m. */
function measure(word: string): number {
  const flags = consonants(word);
  let m = 0;
  let i = 0;
  const n = word.length;
  while (i < n && flags[i]) i++;
  while (i < n) {
    while (i < n && !flags[i]) i++;
    if (i >= n) break;
    m++;
    while (i < n && flags[i]) i++;
  }
  return m;
}

function hasVowel(word: string): boolean {
  return consonants(word).includes(false);
}

function endsWithDoubleConsonant(word: string): boolean {
  const n = word.length;
  return n >= 2 && word[n - 1] === word[n - 2] && consonants(word)[n - 1]!;
}

/** Ends consonant–vowel–consonant where the last consonant is not w, x or y. */
function endsCvc(word: string): boolean {
  const n = word.length;
  if (n < 3) return false;
  const flags = consonants(word);
  if (!flags[n - 1] || flags[n - 2] || !flags[n - 3]) return false;
  const last = word[n - 1];
  return last !== "w" && last !== "x" && last !== "y";
}

type Rule = readonly [suffix: string, replacement: string];

/**
 * Applies the first rule whose suffix matches, when the stem left over
 * satisfies `condition`; later rules are not tried once a suffix has matched.
 */
function applyFirst(
  word: string,
  rules: readonly Rule[],
  condition: (stem: string, suffix: string) => boolean,
): string {
  for (const [suffix, replacement] of rules) {
    if (word.endsWith(suffix)) {
      const stem = word.slice(0, word.length - suffix.length);
      return condition(stem, suffix) ? stem + replacement : word;
    }
  }
  return word;
}

const STEP_2: readonly Rule[] = [
  ["ational", "ate"],
  ["tional", "tion"],
  ["enci", "ence"],
  ["anci", "ance"],
  ["izer", "ize"],
  ["abli", "able"],
  ["alli", "al"],
  ["entli", "ent"],
  ["eli", "e"],
  ["ousli", "ous"],
  ["ization", "ize"],
  ["ation", "ate"],
  ["ator", "ate"],
  ["alism", "al"],
  ["iveness", "ive"],
  ["fulness", "ful"],
  ["ousness", "ous"],
  ["aliti", "al"],
  ["iviti", "ive"],
  ["biliti", "ble"],
];

const STEP_3: readonly Rule[] = [
  ["icate", "ic"],
  ["ative", ""],
  ["alize", "al"],
  ["iciti", "ic"],
  ["ical", "ic"],
  ["ful", ""],
  ["ness", ""],
];

const STEP_4: readonly Rule[] = [
  ["al", ""],
  ["ance", ""],
  ["ence", ""],
  ["er", ""],
  ["ic", ""],
  ["able", ""],
  ["ible", ""],
  ["ant", ""],
  ["ement", ""],
  ["ment", ""],
  ["ent", ""],
  ["ion", ""],
  ["ou", ""],
  ["ism", ""],
  ["ate", ""],
  ["iti", ""],
  ["ous", ""],
  ["ive", ""],
  ["ize", ""],
];

const STEMMABLE = /^[a-z]{3,}$/;

function step1a(word: string): string {
  if (word.endsWith("sses")) return word.slice(0, -2);
  if (word.endsWith("ies")) return word.slice(0, -2);
  if (word.endsWith("ss")) return word;
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

function step1bTail(word: string): string {
  if (word.endsWith("at") || word.endsWith("bl") || word.endsWith("iz")) return `${word}e`;
  if (endsWithDoubleConsonant(word) && !/[lsz]$/.test(word)) return word.slice(0, -1);
  if (measure(word) === 1 && endsCvc(word)) return `${word}e`;
  return word;
}

function step1b(word: string): string {
  if (word.endsWith("eed")) return measure(word.slice(0, -3)) > 0 ? word.slice(0, -1) : word;
  if (word.endsWith("ed") && hasVowel(word.slice(0, -2))) return step1bTail(word.slice(0, -2));
  if (word.endsWith("ing") && hasVowel(word.slice(0, -3))) return step1bTail(word.slice(0, -3));
  return word;
}

function step1c(word: string): string {
  return word.endsWith("y") && hasVowel(word.slice(0, -1)) ? `${word.slice(0, -1)}i` : word;
}

function step4(word: string): string {
  return applyFirst(word, STEP_4, (stem, suffix) => measure(stem) > 1 && (suffix !== "ion" || /[st]$/.test(stem)));
}

function step5(word: string): string {
  let out = word;
  if (out.endsWith("e")) {
    const stem = out.slice(0, -1);
    const m = measure(stem);
    if (m > 1 || (m === 1 && !endsCvc(stem))) out = stem;
  }
  if (measure(out) > 1 && endsWithDoubleConsonant(out) && out.endsWith("l")) out = out.slice(0, -1);
  return out;
}

/** Stems one lowercase word; anything that is not a plain ASCII word of 3+ letters is returned unchanged. */
export function stem(word: string): string {
  if (!STEMMABLE.test(word)) return word;
  let out = step1c(step1b(step1a(word)));
  out = applyFirst(out, STEP_2, (s) => measure(s) > 0);
  out = applyFirst(out, STEP_3, (s) => measure(s) > 0);
  out = step4(out);
  return step5(out);
}
