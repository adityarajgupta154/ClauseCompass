// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { JourneyRoutes } from "@/App";
import { AuthProvider } from "@/features/auth/auth-context";
import { DEFAULT_DISPLAY, setDisplay } from "@/features/display/display-store";
import { en, hinglish } from "@/features/journey/copy";
import { JourneyProvider } from "@/features/journey/journey-context";
import { preloadScreens } from "@/features/journey/screens";
import { INDEXABLE_ROUTES } from "@/features/seo/routes";
import { signInTestReader } from "../support/auth";

/**
 * The page head follows the screen (WCAG 2.4.2, Page Titled): each screen
 * has a title of its own in the reader's language, and the head says which
 * screens a search engine may index. The welcome and the helplines are open
 * to anyone and worth a result; every step of one reader's journey, the
 * sign-in and the safety screen are not.
 */

const mounted: { root: Root; container: HTMLElement }[] = [];

async function mount(path: string) {
  await signInTestReader();
  const location = memoryLocation({ path, record: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const settle = async () => {
    for (let i = 0; i < 4; i += 1) await act(async () => {});
  };
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Router hook={location.hook}>
          <AuthProvider>
            <JourneyProvider>
              <JourneyRoutes />
            </JourneyProvider>
          </AuthProvider>
        </Router>
      </QueryClientProvider>,
    );
  });
  await settle();
  mounted.push({ root, container });
  return {
    settle,
    path: () => new URL(location.history?.at(-1) ?? "", "http://journey.test").pathname,
    click: async (id: string) => {
      const element = container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
      if (element === null) throw new Error(`nothing on screen with data-testid="${id}"`);
      await act(async () => element.click());
      await settle();
    },
  };
}

const meta = (name: string) => document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? null;
const canonical = () => document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? null;

beforeAll(async () => {
  await preloadScreens();
});

beforeEach(() => {
  setDisplay(DEFAULT_DISPLAY);
  document.head.querySelector('link[rel="canonical"]')?.remove();
});

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
  window.sessionStorage.clear();
});

describe("the page head follows the screen", () => {
  it("names the product and what it is on the welcome screen, and marks it indexable", async () => {
    await mount("/");
    expect(document.title).toBe("ClauseCompass | Plain-language navigation for legal documents");
    expect(meta("description")).toBe(en.product.description);
    expect(meta("robots")).toBe("index, follow");
  });

  it("gives every other screen its own heading, then the product name", async () => {
    const page = await mount("/");
    await page.click("button-stage-before-signing");
    expect(page.path()).toBe("/upload");
    expect(document.title).toBe(`${en.upload.heading} | ClauseCompass`);
  });

  it("keeps the helplines open to search engines with their own description, and closes the journey", async () => {
    const page = await mount("/help");
    expect(document.title).toBe(`${en.resources.heading} | ClauseCompass`);
    expect(meta("description")).toBe(en.resources.description);
    expect(meta("robots")).toBe("index, follow");
    await page.click("link-back-from-help");
    await page.click("button-stage-before-signing");
    expect(page.path()).toBe("/upload");
    expect(meta("robots")).toBe("noindex, nofollow");
    expect(meta("description")).toBe(en.product.description);
  });

  it("closes an unknown address to search engines, and opens only the welcome and the helplines", async () => {
    await mount("/nowhere");
    expect(document.title).toBe(`${en.notFoundPage.heading} | ClauseCompass`);
    expect(meta("robots")).toBe("noindex, nofollow");
    // The sign-in and the safety screen are not mountable here (a signed-in reader is sent on, an escalation is needed); the route list is what closes them.
    expect(INDEXABLE_ROUTES).toEqual(["/", "/help"]);
  });

  it("re-titles the screen in place when the language changes", async () => {
    await mount("/help");
    act(() => setDisplay({ locale: "hinglish" }));
    await act(async () => {});
    expect(document.title).toBe(`${hinglish.resources.heading} | ClauseCompass`);
    expect(meta("description")).toBe(hinglish.resources.description);
  });

  it("writes the canonical address for an indexable screen only, when the build knew the site's address", async () => {
    // A build that knows the address leaves this link in index.html; the head component reads the origin from it.
    const link = document.createElement("link");
    link.rel = "canonical";
    link.href = "https://clausecompass.example/";
    document.head.append(link);
    const page = await mount("/");
    expect(canonical()).toBe("https://clausecompass.example/");
    await page.click("link-welcome-official-help");
    expect(page.path()).toBe("/help");
    expect(canonical()).toBe("https://clausecompass.example/help");
    await page.click("link-back-from-help");
    await page.click("button-stage-before-signing");
    expect(page.path()).toBe("/upload");
    expect(canonical()).toBeNull();
  });
});
