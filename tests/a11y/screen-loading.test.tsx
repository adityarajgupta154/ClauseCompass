// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JourneyRoutes } from "@/App";
import { AuthProvider } from "@/features/auth/auth-context";
import { en } from "@/features/journey/copy";
import { JourneyProvider } from "@/features/journey/journey-context";
import { screens } from "@/features/journey/screens";
import { signInTestReader } from "../support/auth";

/**
 * A route change to a screen whose code has not arrived (the other route
 * tests fetch every screen up front, so they never see this): the loading
 * line shows in the screen's place, and when the screen arrives focus
 * lands on its heading, as it would have on a screen that was already
 * here. The upload screen's file is held back for a moment so the loading
 * line is certain to show; nothing in this file preloads the screens, and
 * vitest gives the file its own module instances, so the screen is not
 * remembered from another file.
 */
vi.mock("@/pages/upload", async (importOriginal) => {
  await new Promise((resolve) => setTimeout(resolve, 60));
  return importOriginal();
});

const mounted: { root: Root; container: HTMLElement }[] = [];

async function mount(path: string) {
  await signInTestReader();
  const location = memoryLocation({ path, record: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
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
  for (let i = 0; i < 4; i += 1) await act(async () => {});
  mounted.push({ root, container });
  return {
    byTestId: (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`),
    heading: () => container.querySelector<HTMLElement>("h1"),
    path: () => new URL(location.history?.at(-1) ?? "", "http://journey.test").pathname,
  };
}

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
  window.sessionStorage.clear();
});

describe("a screen fetched on first use", () => {
  it("shows the loading line while its code is fetched, then puts focus on its heading", async () => {
    const page = await mount("/");
    expect(screens.upload.peek()).toBeNull();
    const button = page.byTestId("button-stage-before-signing");
    if (button === null) throw new Error("no stage button on the welcome screen");
    button.focus();
    await act(async () => button.click());
    expect(page.path()).toBe("/upload");
    // The line stands in for the screen, and no heading has been focused: the old screen's, still in the document but hidden, is not what the reader is told about.
    expect(page.byTestId("status-screen-loading")).not.toBeNull();
    expect(document.activeElement?.tagName).not.toBe("H1");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    for (let i = 0; i < 4; i += 1) await act(async () => {});
    expect(page.byTestId("status-screen-loading")).toBeNull();
    expect(screens.upload.peek()).not.toBeNull();
    const heading = page.heading();
    expect(heading?.textContent).toBe(en.upload.heading);
    expect(document.activeElement).toBe(heading);
  });

  it("renders a remembered screen at once on the next visit, with no loading line", async () => {
    const page = await mount("/");
    const button = page.byTestId("button-stage-before-signing");
    if (button === null) throw new Error("no stage button on the welcome screen");
    await act(async () => button.click());
    expect(page.path()).toBe("/upload");
    expect(page.byTestId("status-screen-loading")).toBeNull();
    expect(document.activeElement).toBe(page.heading());
  });
});
