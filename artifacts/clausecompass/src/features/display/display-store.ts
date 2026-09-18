/**
 * The display settings (FR-11): the language of the product's own words, the
 * size of the text, and the theme (light, dark, or whatever the device is set
 * to). One small external store, read by the copy tables (`copy` resolves
 * against the current language) and by the settings menu in the header of
 * every screen. All three are the reader's, not the session's: they persist
 * in localStorage across sessions and refreshes, and hold nothing about any
 * document.
 *
 * The store applies its settings to the page itself: `<html lang>` follows
 * the language (so a screen reader picks a matching voice), the root font
 * size follows the text size (every measurement in the app is in rem, so the
 * whole layout scales with it, as it would with the browser's own text-size
 * setting), and the `dark` class on the root switches the colour tokens
 * (`index.css`; screen only, the printed packet stays on white paper).
 * index.html reads the same stored value before the first paint so a dark
 * screen never flashes light.
 */

/** The languages the product's own words come in. Document text and the statements prepared from it are never translated. */
export type Locale = "en" | "hinglish";

/** Percent of the browser's default text size; the steps the control offers, smallest first. */
export const TEXT_SIZES = [100, 115, 130, 150] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

/** The reader's choice of theme; "system" follows the device's own setting, as it changes. */
export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

export interface DisplaySettings {
  locale: Locale;
  textSize: TextSize;
  theme: Theme;
}

export const DEFAULT_DISPLAY: DisplaySettings = { locale: "en", textSize: 100, theme: "system" };

/** The BCP 47 tag `<html lang>` carries for each language; Hinglish is Hindi in Latin script. */
export const LANG_TAGS: Record<Locale, string> = { en: "en", hinglish: "hi-Latn" };

export const DISPLAY_STORAGE_KEY = "clausecompass.display";

const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "hinglish";
}

function isTextSize(value: unknown): value is TextSize {
  return TEXT_SIZES.some((size) => size === value);
}

function isTheme(value: unknown): value is Theme {
  return (THEMES as readonly unknown[]).includes(value);
}

/** Settings from a stored value; anything unreadable or unknown falls back to the default, field by field. */
export function parseDisplay(raw: string | null): DisplaySettings {
  if (raw === null) return DEFAULT_DISPLAY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_DISPLAY;
    const { locale, textSize, theme } = parsed as Record<string, unknown>;
    return {
      locale: isLocale(locale) ? locale : DEFAULT_DISPLAY.locale,
      textSize: isTextSize(textSize) ? textSize : DEFAULT_DISPLAY.textSize,
      theme: isTheme(theme) ? theme : DEFAULT_DISPLAY.theme,
    };
  } catch {
    return DEFAULT_DISPLAY;
  }
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Storage access can throw (privacy modes, sandboxed frames); the settings then last for the page only.
    return null;
  }
}

/** The device's dark-scheme query, where the browser has one (happy-dom and old engines have no matchMedia). */
function darkSchemeQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  return window.matchMedia(DARK_SCHEME_QUERY);
}

/** The theme the screen is showing: the reader's choice, or the device's setting when the choice is "system" (light where the device says nothing). */
export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  return darkSchemeQuery()?.matches ? "dark" : "light";
}

function applyToDocument(settings: DisplaySettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.lang = LANG_TAGS[settings.locale];
  root.style.fontSize = settings.textSize === 100 ? "" : `${settings.textSize}%`;
  const resolved = resolveTheme(settings.theme);
  root.classList.toggle("dark", resolved === "dark");
  // Form controls, scrollbars and the like follow the theme too.
  root.style.colorScheme = resolved;
}

let current: DisplaySettings = parseDisplay(storage()?.getItem(DISPLAY_STORAGE_KEY) ?? null);
const listeners = new Set<() => void>();
applyToDocument(current);
// A device that changes its own setting (dusk, a schedule) changes the screen while "system" is the choice; the choice itself does not change, so nobody is told.
darkSchemeQuery()?.addEventListener?.("change", () => {
  if (current.theme === "system") applyToDocument(current);
});

export function getDisplay(): DisplaySettings {
  return current;
}

export function subscribeDisplay(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setDisplay(patch: Partial<DisplaySettings>): void {
  const next = { ...current, ...patch };
  if (next.locale === current.locale && next.textSize === current.textSize && next.theme === current.theme) return;
  current = next;
  try {
    storage()?.setItem(DISPLAY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // A full or read-only store keeps the setting for this page only.
  }
  applyToDocument(next);
  for (const listener of listeners) listener();
}

/** The next step up or down from a size, or null at the end of the range. */
export function stepTextSize(size: TextSize, direction: 1 | -1): TextSize | null {
  const index = TEXT_SIZES.indexOf(size);
  return TEXT_SIZES[index + direction] ?? null;
}
