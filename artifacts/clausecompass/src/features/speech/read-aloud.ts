/**
 * Read-aloud (FR-11) on the browser's own speech synthesis: nothing is sent
 * anywhere and there is no service behind it. One small store says which
 * reading, if any, is in progress, so every read-aloud button on a screen
 * shows the right state and starting one reading stops another.
 *
 * What is read is decided by the caller: the plain-language statements and
 * the prompts a screen shows, in the words it shows them. A statement the
 * screen withholds is never read, because the caller builds the reading from
 * the same resolved claims it renders.
 */

/**
 * Longest utterance queued at once. Chrome's engine stops silently, without
 * an end event, partway through a long utterance (around fifteen seconds of
 * speech), so sentences are grouped up to this length and a longer sentence
 * is split at a clause or word boundary.
 */
export const MAX_UTTERANCE_CHARS = 200;

/** How often the reading in progress is checked against the engine, in ms. */
export const WATCHDOG_INTERVAL_MS = 1000;

/** The language the statements are in: the model writes them in English, in the document's own terms. */
export const SPEECH_LANG = "en-IN";

/** Which reading is in progress, and which one last failed to start (the browser has the API but no working voice). */
export interface ReadingState {
  activeId: string | null;
  failedId: string | null;
}

let state: ReadingState = { activeId: null, failedId: null };
/** Counts readings started, so an event from a reading that was cancelled and restarted under the same id cannot settle the new one. */
let run = 0;
let watchdog: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function isSpeechSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.speechSynthesis === "object" &&
    window.speechSynthesis !== null &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}

export function getReadingState(): ReadingState {
  return state;
}

function setState(next: ReadingState): void {
  state = next;
  notify();
}

export function subscribeReading(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * A sentence longer than the limit, split into parts of at most `limit`
 * characters, at the last clause break (comma, semicolon, colon, dash) inside
 * the limit if there is one, else at the last space, else at the limit. No
 * text is dropped.
 */
function splitLongSentence(sentence: string, limit: number): string[] {
  const parts: string[] = [];
  let rest = sentence;
  while (rest.length > limit) {
    const window = rest.slice(0, limit + 1);
    const clauseBreak = Math.max(window.lastIndexOf(", "), window.lastIndexOf("; "), window.lastIndexOf(": "), window.lastIndexOf(" — "), window.lastIndexOf(" - "));
    const wordBreak = window.lastIndexOf(" ");
    // A clause break is preferred when it leaves at least a third of the window; a tiny first part reads worse than a mid-clause pause.
    const at = clauseBreak >= limit / 3 ? clauseBreak + 1 : wordBreak > 0 ? wordBreak : limit;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest.length > 0) parts.push(rest);
  return parts;
}

/**
 * Sentences grouped into utterances of at most MAX_UTTERANCE_CHARS, keeping
 * every piece of text: a sentence longer than the limit is split at a clause
 * or word boundary rather than cut. Blank pieces are dropped.
 */
export function chunkForSpeech(pieces: readonly string[], limit = MAX_UTTERANCE_CHARS): string[] {
  const sentences = pieces
    .flatMap((piece) => piece.split(/(?<=[.!?।])\s+/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
    .flatMap((sentence) => (sentence.length > limit ? splitLongSentence(sentence, limit) : [sentence]));
  const utterances: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current.length === 0) current = sentence;
    else if (current.length + 1 + sentence.length <= limit) current = `${current} ${sentence}`;
    else {
      utterances.push(current);
      current = sentence;
    }
  }
  if (current.length > 0) utterances.push(current);
  return utterances;
}

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const wanted = SPEECH_LANG.toLowerCase();
  return (
    voices.find((voice) => voice.lang.toLowerCase().replace("_", "-") === wanted) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) ??
    null
  );
}

/** Start reading `pieces` under `id`, stopping any reading in progress first. No-op where speech is unsupported or there is nothing to read. */
export function startReading(id: string, pieces: readonly string[]): void {
  if (!isSpeechSupported()) return;
  const utterances = chunkForSpeech(pieces);
  if (utterances.length === 0) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  clearWatchdog();
  run += 1;
  const thisRun = run;
  setState({ activeId: id, failedId: null });
  const voice = pickVoice();
  const last = utterances.length - 1;
  let spoke = false;
  const finish = (failed: boolean) => {
    // A later reading (even under the same id) has taken over; its own events settle it.
    if (thisRun !== run || state.activeId !== id) return;
    clearWatchdog();
    setState({ activeId: null, failedId: failed ? id : null });
  };
  utterances.forEach((text, index) => {
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = SPEECH_LANG;
    if (voice) utterance.voice = voice;
    utterance.rate = 0.95;
    utterance.onstart = () => {
      spoke = true;
    };
    if (index === last) utterance.onend = () => finish(false);
    // cancel() raises "interrupted"/"canceled" on the queued utterances; the reading that cancelled them has already taken over.
    utterance.onerror = (event) => {
      if (event.error === "interrupted" || event.error === "canceled") return;
      // An error before anything was heard is a browser with no working voice; the button says so rather than falling silent.
      finish(!spoke);
    };
    synth.speak(utterance);
  });
  // Engines are known to drop the end event (Chrome after a silent stop, Safari on some voices); when the queue has
  // been empty for two checks in a row, the reading is over whatever the events said.
  let idleChecks = 0;
  watchdog = setInterval(() => {
    if (synth.speaking || synth.pending) {
      idleChecks = 0;
      return;
    }
    idleChecks += 1;
    if (idleChecks >= 2) finish(!spoke);
  }, WATCHDOG_INTERVAL_MS);
}

function clearWatchdog(): void {
  if (watchdog !== null) clearInterval(watchdog);
  watchdog = null;
}

/** Stop the reading in progress (any id). */
export function stopReading(): void {
  if (isSpeechSupported()) window.speechSynthesis.cancel();
  clearWatchdog();
  run += 1;
  if (state.activeId === null) return;
  setState({ activeId: null, failedId: state.failedId });
}

/** Stop only if `id` is the reading in progress: a button unmounting stops its own reading and no other. */
export function stopReadingIf(id: string): void {
  if (state.activeId === id) stopReading();
}
