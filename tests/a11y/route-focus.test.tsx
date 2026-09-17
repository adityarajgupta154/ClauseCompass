// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { JourneyRoutes } from "@/App";
import { AuthProvider } from "@/features/auth/auth-context";
import { ErrorBoundary } from "@/components/error-boundary";
import { JourneyProvider } from "@/features/journey/journey-context";
import { focusScreen } from "@/features/journey/route-focus";
import { preloadScreens } from "@/features/journey/screens";
import { signInTestReader } from "../support/auth";

/**
 * Where focus goes when the route changes (Task 7.1): the activated control
 * leaves with the old screen, so without help focus falls to the document
 * body and a screen reader hears nothing. The mounted route table must put
 * it on the new screen's heading, leave the page load alone, and settle on
 * the screen a guard finally shows rather than the one it turned away. A
 * crash and its "Try again" replace the focused element at the same
 * location, so the error boundary hands focus over the same way. A screen
 * that places focus itself on arrival (the safety screen, the deletion
 * notice) is covered by the keyboard journey `pnpm a11y` drives in a
 * browser.
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
  const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  return {
    location,
    settle,
    byTestId,
    heading: () => container.querySelector<HTMLElement>("h1"),
    path: () => new URL(location.history?.at(-1) ?? "", "http://journey.test").pathname,
    click: async (id: string) => {
      const element = byTestId(id);
      if (element === null) throw new Error(`nothing on screen with data-testid="${id}"`);
      element.focus();
      await act(async () => element.click());
      await settle();
    },
  };
}

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
  window.sessionStorage.clear();
});

// The screens after the welcome are fetched on first use in the app; here they are fetched once up front, so a mount renders its screen rather than the loading line.
beforeAll(async () => {
  await preloadScreens();
});

describe("focus on route change", () => {
  it("leaves the page load alone: nothing is focused until the reader acts", async () => {
    const page = await mount("/");
    expect(page.heading()).not.toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it("moves to the new screen's heading after a choice on the welcome screen", async () => {
    const page = await mount("/");
    await page.click("button-stage-before-signing");
    expect(page.path()).toBe("/upload");
    const heading = page.heading();
    expect(heading).not.toBeNull();
    expect(document.activeElement).toBe(heading);
    expect(heading?.getAttribute("tabindex")).toBe("-1");
  });

  it("settles on the screen a guard shows, not the one it turned away", async () => {
    const page = await mount("/");
    // Straight to the interview with no stage chosen: the guard sends the reader back to the start.
    await act(async () => page.location.navigate("/interview"));
    await page.settle();
    expect(page.path()).toBe("/");
    expect(page.byTestId("button-stage-before-signing")).not.toBeNull();
    expect(document.activeElement).toBe(page.heading());
  });

  it("follows the reader out to the helplines and back again", async () => {
    const page = await mount("/");
    await page.click("link-welcome-official-help");
    expect(page.path()).toBe("/help");
    expect(document.activeElement).toBe(page.heading());
    await page.click("link-back-from-help");
    expect(page.path()).toBe("/");
    expect(document.activeElement).toBe(page.heading());
  });
});

/** A screen that crashes on demand, with the heading a recovered screen shows. */
let crashing = true;
function Fragile() {
  if (crashing) throw new Error("rendering failed, for the test");
  return <h1>Recovered screen</h1>;
}

describe("focus when the error boundary shows and clears its fallback", () => {
  it("moves to the fallback's heading on a crash and to the screen's heading on Try again", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    crashing = true;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mounted.push({ root, container });
    function Host() {
      const [key] = useState("same-location");
      return (
        <ErrorBoundary resetKey={key} onErrorStateChange={focusScreen}>
          <Fragile />
        </ErrorBoundary>
      );
    }
    await act(async () => root.render(<Host />));
    const fallbackHeading = container.querySelector("h1");
    expect(fallbackHeading?.textContent).toBe("Something went wrong");
    expect(document.activeElement).toBe(fallbackHeading);

    crashing = false;
    const retry = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Try again");
    if (retry === undefined) throw new Error("no Try again button on the fallback");
    retry.focus();
    await act(async () => retry.click());
    const heading = container.querySelector("h1");
    expect(heading?.textContent).toBe("Recovered screen");
    expect(document.activeElement).toBe(heading);
    quiet.mockRestore();
  });
});
