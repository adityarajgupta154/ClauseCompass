import { getDisplay, type Locale } from "@/features/display/display-store";
import { en, type Copy } from "./copy.en";
import { hinglish } from "./copy.hinglish";

export { en, minutesPhrase, type Copy } from "./copy.en";
export { hinglish } from "./copy.hinglish";
export type { Locale } from "@/features/display/display-store";

/** The table for each language (FR-11). */
export const tables: Record<Locale, Copy> = { en, hinglish };

/**
 * Every sentence the product says, in the reader's language. A component
 * reads `copy.upload.heading` as before and gets the line for the language
 * chosen on the display controls: the object resolves each top-level section
 * against the current language at the moment it is read, so nothing is
 * captured at import time. The route table re-renders every screen when the
 * language changes (JourneyRoutes subscribes to the display settings), so a
 * render always reads the current table.
 *
 * Two places bypass this on purpose and read `en` directly: the preparation
 * packet, which is prepared in English whatever the screen shows, and tests
 * that pin English wording.
 */
export const copy: Copy = new Proxy(en, {
  get(_target, key, receiver) {
    return Reflect.get(tables[getDisplay().locale], key, receiver);
  },
});
