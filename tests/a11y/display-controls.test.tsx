// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteHeader } from "@/components/site-header";
import { DISPLAY_STORAGE_KEY, getDisplay, setDisplay } from "@/features/display/display-store";
import { useDisplay } from "@/features/display/use-display";
import { indexChunks } from "@/features/grounding/resolve-claim";
import { MOCK_CASES, MOCK_CHUNKS } from "@/features/grounding/mock-claims";
import { SourceCard } from "@/features/grounding/source-card";
import { en, hinglish } from "@/features/journey/copy";
import { ReadAloudButton } from "@/features/speech/read-aloud-button";

/**
 * The display controls (Task 7.2, FR-11) on a mounted screen, inside the
 * header's settings menu. The language toggle must change the product's own
 * words and nothing else: the source card's statement and excerpt are the
 * same bytes in both languages, and Hinglish is labelled as convenience text
 * on the screen while it shows. The text-size control scales the page root
 * and persists; the theme control switches the root's class and follows the
 * device when asked to; the menu itself opens and closes from the keyboard
 * and from a press outside it. Read-aloud uses the browser's own speech and
 * shows its state on the button.
 */

const mounted: { root: Root; container: HTMLElement }[] = [];

/**
 * A screen: the header (without the account control, which needs the auth
 * and journey providers), then the body, under a component that subscribes
 * the way JourneyRoutes does and, like it, creates the body's elements in
 * its own render (an element created once and passed down would be bailed
 * out of the re-render, which is why the route table owns its subtree).
 */
function Screen({ body }: { body: () => ReactNode }) {
  useDisplay();
  return (
    <>
      <SiteHeader account={false} />
      {body()}
    </>
  );
}

async function mount(body: () => ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Screen body={body} />);
  });
  mounted.push({ root, container });
  const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const click = async (id: string) => {
    const element = byTestId(id);
    if (element === null) throw new Error(`nothing on screen with data-testid="${id}"`);
    await act(async () => {
      element.click();
    });
  };
  return {
    byTestId,
    text: (id: string) => byTestId(id)?.textContent ?? null,
    click,
    /** The settings controls live in the header's menu; a reader opens it first. */
    openSettings: () => click("button-settings"),
    /** Whether the panel is showing: it stays in the tree, hidden, while closed. */
    settingsOpen: () => byTestId("settings-panel")?.hidden === false,
  };
}

/** A device dark-scheme setting the store can read, with a way to change it under the page. */
function stubColorScheme(dark: boolean) {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const query = {
    matches: dark,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => listeners.delete(listener),
  };
  vi.stubGlobal("matchMedia", vi.fn(() => query));
  return {
    set: (next: boolean) => {
      query.matches = next;
      for (const listener of listeners) listener({ matches: next });
    },
  };
}

const chunks = indexChunks(MOCK_CHUNKS);
const grounded = MOCK_CASES.find((mockCase) => mockCase.id === "single")!;

beforeEach(() => {
  window.localStorage.clear();
  setDisplay({ locale: "en", textSize: 100, theme: "light" });
});

afterEach(async () => {
  for (const { root, container } of mounted.splice(0)) {
    await act(async () => root.unmount());
    container.remove();
  }
  setDisplay({ locale: "en", textSize: 100, theme: "light" });
  vi.unstubAllGlobals();
});

describe("language toggle", () => {
  it("changes the product's words and leaves the statement and the excerpt byte-identical", async () => {
    const screen = await mount(() => <SourceCard claim={grounded.claim} chunks={chunks} topic={grounded.topic} defaultOpen />);
    const claimBefore = screen.text("text-claim");
    const excerptBefore = screen.text("text-excerpt-0");
    expect(claimBefore).toBe(grounded.claim.text);
    expect(screen.text("button-toggle-source")).toBe(en.sourceCard.hide(1));
    expect(screen.byTestId("text-convenience-note")).toBeNull();
    expect(document.documentElement.lang).toBe("en");

    await screen.openSettings();
    await screen.click("button-language-hinglish");

    expect(screen.text("button-toggle-source")).toBe(hinglish.sourceCard.hide(1));
    expect(screen.text("text-claim")).toBe(claimBefore);
    expect(screen.text("text-excerpt-0")).toBe(excerptBefore);
    expect(screen.byTestId("text-claim")?.getAttribute("lang")).toBe("en");
    expect(screen.byTestId("button-language-hinglish")?.getAttribute("aria-pressed")).toBe("true");
    expect(screen.byTestId("button-language-en")?.getAttribute("aria-pressed")).toBe("false");
    expect(document.documentElement.lang).toBe("hi-Latn");
    // The note is on the screen itself (the header), not only inside the panel.
    expect(screen.text("text-convenience-note")).toBe(hinglish.display.convenience);
    expect(screen.byTestId("settings-panel")?.contains(screen.byTestId("text-convenience-note"))).toBe(false);
    // The panel's own words changed with it, in place: it is still open.
    expect(screen.settingsOpen()).toBe(true);
    expect(screen.byTestId("button-settings")?.getAttribute("aria-label")).toBe(hinglish.display.label);

    await screen.click("button-language-en");
    expect(screen.text("button-toggle-source")).toBe(en.sourceCard.hide(1));
    expect(screen.text("text-claim")).toBe(claimBefore);
    expect(screen.text("text-excerpt-0")).toBe(excerptBefore);
    expect(screen.byTestId("text-convenience-note")).toBeNull();
    expect(document.documentElement.lang).toBe("en");
  });

  it("keeps the source panel open across a language change (re-render, not remount)", async () => {
    const screen = await mount(() => <SourceCard claim={grounded.claim} chunks={chunks} topic={grounded.topic} />);
    await screen.click("button-toggle-source");
    expect(screen.byTestId("button-toggle-source")?.getAttribute("aria-expanded")).toBe("true");
    await screen.openSettings();
    await screen.click("button-language-hinglish");
    expect(screen.byTestId("button-toggle-source")?.getAttribute("aria-expanded")).toBe("true");
    expect(screen.text("button-toggle-source")).toBe(hinglish.sourceCard.hide(1));
  });

  it("persists the choice for the next visit", async () => {
    const screen = await mount(() => null);
    await screen.openSettings();
    await screen.click("button-language-hinglish");
    expect(JSON.parse(window.localStorage.getItem(DISPLAY_STORAGE_KEY) ?? "{}")).toMatchObject({ locale: "hinglish" });
  });
});

describe("text size", () => {
  it("steps the root font size, announces the size, and persists it", async () => {
    const screen = await mount(() => null);
    await screen.openSettings();
    expect(document.documentElement.style.fontSize).toBe("");
    expect(screen.byTestId("button-text-smaller")?.getAttribute("aria-disabled")).toBe("true");

    await screen.click("button-text-larger");
    expect(document.documentElement.style.fontSize).toBe("115%");
    expect(screen.text("text-size-readout")).toContain(en.display.textSize.status(115));
    expect(screen.byTestId("button-text-smaller")?.getAttribute("aria-disabled")).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(DISPLAY_STORAGE_KEY) ?? "{}")).toMatchObject({ textSize: 115 });

    await screen.click("button-text-larger");
    await screen.click("button-text-larger");
    expect(document.documentElement.style.fontSize).toBe("150%");
    expect(screen.byTestId("button-text-larger")?.getAttribute("aria-disabled")).toBe("true");
    // The end of the range is a no-op that keeps the button in the tab order, not a disabled control.
    await screen.click("button-text-larger");
    expect(getDisplay().textSize).toBe(150);

    await screen.click("button-text-smaller");
    expect(document.documentElement.style.fontSize).toBe("130%");
  });
});

describe("theme", () => {
  it("switches the root's class and colour scheme, marks the choice, and persists it", async () => {
    stubColorScheme(false);
    const screen = await mount(() => null);
    await screen.openSettings();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(screen.byTestId("button-theme-light")?.getAttribute("aria-pressed")).toBe("true");

    await screen.click("button-theme-dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(screen.byTestId("button-theme-dark")?.getAttribute("aria-pressed")).toBe("true");
    expect(screen.byTestId("button-theme-light")?.getAttribute("aria-pressed")).toBe("false");
    expect(JSON.parse(window.localStorage.getItem(DISPLAY_STORAGE_KEY) ?? "{}")).toMatchObject({ theme: "dark" });

    await screen.click("button-theme-light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("follows the device while the choice is system, as the device changes", async () => {
    const device = stubColorScheme(true);
    const screen = await mount(() => null);
    await screen.openSettings();
    await screen.click("button-theme-system");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(getDisplay().theme).toBe("system");

    // The device switches under the page: the screen follows, the choice stays "system".
    // The store listens from its own load; this test's stub was installed after, so it re-applies through a fresh setting instead.
    device.set(false);
    setDisplay({ theme: "light" });
    setDisplay({ theme: "system" });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(screen.byTestId("button-theme-system")?.getAttribute("aria-pressed")).toBe("true");

    // A chosen theme ignores the device.
    device.set(true);
    await screen.click("button-theme-light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});

describe("settings menu", () => {
  it("opens from the gear, names itself, and closes on Escape with focus back on the gear", async () => {
    const screen = await mount(() => null);
    const gear = screen.byTestId("button-settings")!;
    expect(gear.getAttribute("aria-expanded")).toBe("false");
    expect(gear.getAttribute("aria-label")).toBe(en.display.label);
    expect(screen.settingsOpen()).toBe(false);
    expect(gear.getAttribute("aria-controls")).toBe(screen.byTestId("settings-panel")?.id);

    await screen.openSettings();
    expect(gear.getAttribute("aria-expanded")).toBe("true");
    expect(screen.settingsOpen()).toBe(true);
    expect(screen.byTestId("settings-panel")?.getAttribute("aria-label")).toBe(en.display.label);
    // Every named destination is there, and the about link leads to the boundary statement on the welcome screen.
    expect(screen.byTestId("link-settings-help")?.getAttribute("href")).toBe("/help");
    expect(screen.byTestId("link-settings-about")?.getAttribute("href")).toBe("/#boundary-heading");
    // Nothing configured, so no feedback row: a link to nowhere would be worse than none.
    expect(screen.byTestId("link-settings-feedback")).toBeNull();

    const languageButton = screen.byTestId("button-language-en")!;
    await act(async () => {
      languageButton.focus();
      languageButton.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(screen.settingsOpen()).toBe(false);
    expect(gear.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(gear);

    // The gear toggles: a second press closes what the first opened.
    await screen.openSettings();
    expect(screen.settingsOpen()).toBe(true);
    await screen.openSettings();
    expect(screen.settingsOpen()).toBe(false);
  });

  it("closes on a press outside it and when focus leaves it, and keeps the settings made meanwhile", async () => {
    const screen = await mount(() => <button type="button" data-testid="button-elsewhere">elsewhere</button>);
    await screen.openSettings();
    await screen.click("button-text-larger");
    expect(screen.settingsOpen()).toBe(true);

    await act(async () => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(screen.settingsOpen()).toBe(false);
    expect(getDisplay().textSize).toBe(115);

    // A press inside the panel is not a press outside it.
    await screen.openSettings();
    await act(async () => {
      screen.byTestId("button-text-smaller")?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(screen.settingsOpen()).toBe(true);

    // Tab past the last item: focus lands elsewhere on the page and the panel goes with it.
    const last = screen.byTestId("link-settings-about")!;
    const elsewhere = screen.byTestId("button-elsewhere")!;
    await act(async () => {
      last.focus();
      elsewhere.focus();
    });
    expect(screen.settingsOpen()).toBe(false);
  });

  it("leaves the about link out where the header has no way home (the safety screen)", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<SiteHeader home={false} />);
    });
    mounted.push({ root, container });
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="button-settings"]')?.click();
    });
    expect(container.querySelector('[data-testid="link-settings-help"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="link-settings-about"]')).toBeNull();
    expect(container.querySelector('[data-testid="link-home"]')).toBeNull();
  });
});

describe("read-aloud", () => {
  type Spoken = { text: string; lang: string; onstart?: () => void; onend?: () => void; onerror?: (event: { error: string }) => void };

  function stubSpeech() {
    const spoken: Spoken[] = [];
    const synth = {
      speaking: false,
      pending: false,
      speak: vi.fn((utterance: Spoken) => spoken.push(utterance)),
      cancel: vi.fn(),
      getVoices: vi.fn(() => [{ lang: "en-IN", name: "test" }]),
    };
    class Utterance {
      text: string;
      lang = "";
      voice: unknown = null;
      rate = 1;
      onstart?: () => void;
      onend?: () => void;
      onerror?: (event: { error: string }) => void;
      constructor(text: string) {
        this.text = text;
      }
    }
    vi.stubGlobal("speechSynthesis", synth);
    vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
    return { synth, spoken };
  }

  it("reads the statement with the browser's speech and shows its state on the button", async () => {
    const { synth, spoken } = stubSpeech();
    const screen = await mount(() => <SourceCard claim={grounded.claim} chunks={chunks} topic={grounded.topic} />);
    expect(screen.text("button-read-aloud")).toBe(en.readAloud.start);

    await screen.click("button-read-aloud");
    expect(synth.cancel).toHaveBeenCalledTimes(1);
    expect(spoken.map((utterance) => utterance.text).join(" ")).toBe(`${grounded.topic} ${grounded.claim.text}`);
    expect(spoken.every((utterance) => utterance.lang === "en-IN")).toBe(true);
    expect(screen.text("button-read-aloud")).toBe(en.readAloud.stop);

    await act(async () => spoken.at(-1)?.onend?.());
    expect(screen.text("button-read-aloud")).toBe(en.readAloud.start);
  });

  it("stops on the second press and when the button leaves the screen", async () => {
    const { synth } = stubSpeech();
    const screen = await mount(() => <ReadAloudButton pieces={["One sentence.", "Another."]} />);
    await screen.click("button-read-aloud");
    expect(screen.text("button-read-aloud")).toBe(en.readAloud.stop);
    await screen.click("button-read-aloud");
    expect(synth.cancel).toHaveBeenCalledTimes(2);
    expect(screen.text("button-read-aloud")).toBe(en.readAloud.start);

    await screen.click("button-read-aloud");
    const { root, container } = mounted.pop()!;
    await act(async () => root.unmount());
    container.remove();
    expect(synth.cancel).toHaveBeenCalledTimes(4);
  });

  it("ignores a late end event from a reading that was stopped and restarted under the same button", async () => {
    const { spoken } = stubSpeech();
    const screen = await mount(() => <ReadAloudButton pieces={["One sentence."]} />);
    await screen.click("button-read-aloud");
    const first = spoken[0];
    await screen.click("button-read-aloud");
    await screen.click("button-read-aloud");
    expect(screen.text("button-read-aloud")).toBe(en.readAloud.stop);
    // Safari fires onend rather than onerror("interrupted") for a cancelled utterance.
    await act(async () => first?.onend?.());
    expect(screen.text("button-read-aloud")).toBe(en.readAloud.stop);
    await act(async () => spoken[1]?.onend?.());
    expect(screen.text("button-read-aloud")).toBe(en.readAloud.start);
  });

  it("settles a reading whose end event never arrives once the engine has been idle for two checks", async () => {
    vi.useFakeTimers();
    try {
      const { synth, spoken } = stubSpeech();
      const screen = await mount(() => <ReadAloudButton pieces={["One sentence."]} />);
      await screen.click("button-read-aloud");
      await act(async () => spoken[0]?.onstart?.());
      expect(screen.text("button-read-aloud")).toBe(en.readAloud.stop);
      // Still speaking: nothing changes however long it takes.
      Object.assign(synth, { speaking: true, pending: false });
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.text("button-read-aloud")).toBe(en.readAloud.stop);
      Object.assign(synth, { speaking: false, pending: false });
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.text("button-read-aloud")).toBe(en.readAloud.stop);
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.text("button-read-aloud")).toBe(en.readAloud.start);
      expect(screen.text("button-read-aloud-status")).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("says so when the browser has the API but no voice that starts", async () => {
    const { spoken } = stubSpeech();
    const screen = await mount(() => <ReadAloudButton pieces={["One sentence."]} />);
    expect(screen.byTestId("button-read-aloud-status")?.textContent).toBe("");
    await screen.click("button-read-aloud");
    await act(async () => spoken[0]?.onerror?.({ error: "synthesis-failed" }));
    expect(screen.text("button-read-aloud")).toBe(en.readAloud.start);
    expect(screen.text("button-read-aloud-status")).toBe(en.readAloud.unavailable);
    expect(screen.byTestId("button-read-aloud-status")?.getAttribute("role")).toBe("status");
    // The next attempt clears the notice; an error after speech was heard is an ordinary end.
    await screen.click("button-read-aloud");
    expect(screen.text("button-read-aloud-status")).toBe("");
    await act(async () => {
      spoken[1]?.onstart?.();
      spoken[1]?.onerror?.({ error: "synthesis-failed" });
    });
    expect(screen.text("button-read-aloud")).toBe(en.readAloud.start);
    expect(screen.text("button-read-aloud-status")).toBe("");
  });

  it("does not render where the browser has no speech synthesis", async () => {
    vi.stubGlobal("speechSynthesis", undefined);
    const screen = await mount(() => <SourceCard claim={grounded.claim} chunks={chunks} topic={grounded.topic} />);
    expect(screen.byTestId("button-read-aloud")).toBeNull();
    expect(screen.byTestId("button-toggle-source")).not.toBeNull();
  });
});
