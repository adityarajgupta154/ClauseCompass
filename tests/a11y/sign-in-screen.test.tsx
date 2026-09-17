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
import { en } from "@/features/journey/copy";
import { JourneyProvider } from "@/features/journey/journey-context";
import { preloadScreens } from "@/features/journey/screens";
import { signOutTestReader } from "../support/auth";

/**
 * The sign-in screen's form changes what it does in place — sign in, create
 * an account, send a password reset — without the route changing. Each
 * switch must announce itself the way a new screen would (Task 7.1, WCAG
 * 2.4.2 and 2.4.3): the heading says what the form now does and takes
 * focus, and the tab title follows the heading; back in sign-in mode the
 * route's own title stands again.
 */

const mounted: { root: Root; container: HTMLElement }[] = [];

async function mountSignedOut() {
  await signOutTestReader();
  const location = memoryLocation({ path: "/sign-in", record: true });
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
  const byTestId = (id: string) => {
    const element = container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    if (element === null) throw new Error(`nothing on screen with data-testid="${id}"`);
    return element;
  };
  return {
    byTestId,
    press: async (id: string) => {
      await act(async () => byTestId(id).click());
      await settle();
    },
  };
}

beforeAll(async () => {
  await preloadScreens();
});

beforeEach(() => {
  setDisplay(DEFAULT_DISPLAY);
});

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
  window.sessionStorage.clear();
});

const { modes } = en.auth.signIn;

describe("switching what the sign-in form does", () => {
  it("re-titles the tab by the heading on show, and gives the route its title back", async () => {
    const page = await mountSignedOut();
    expect(document.title).toBe(`${modes.signIn.heading} | ClauseCompass`);

    await page.press("button-mode-create");
    expect(page.byTestId("text-sign-in-heading").textContent).toBe(`${modes.create.heading} ${modes.create.accent}`);
    // One sentence in the heading; a title carries no full stop.
    expect(document.title).toBe(`${modes.create.heading} ${modes.create.accent.replace(/\.$/, "")} | ClauseCompass`);

    await page.press("button-mode-sign-in");
    expect(document.title).toBe(`${modes.signIn.heading} | ClauseCompass`);

    await page.press("button-mode-reset");
    expect(document.title).toBe(`${modes.reset.heading} | ClauseCompass`);
  });

  it("moves focus to the heading on a switch, not on arrival", async () => {
    const page = await mountSignedOut();
    expect(document.activeElement).toBe(document.body);

    await page.press("button-mode-create");
    expect(document.activeElement).toBe(page.byTestId("text-sign-in-heading"));

    // The password field is hidden again on the way back, and the reset form has none.
    await page.press("button-mode-sign-in");
    expect(document.activeElement).toBe(page.byTestId("text-sign-in-heading"));
    expect(page.byTestId("input-password").getAttribute("type")).toBe("password");
  });

  it("shows the password as typed only while the toggle is pressed", async () => {
    const page = await mountSignedOut();
    const field = page.byTestId("input-password");
    const toggle = page.byTestId("button-toggle-password");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.getAttribute("aria-label")).toBe(en.auth.signIn.showPassword);
    expect(toggle.getAttribute("aria-controls")).toBe(field.id);

    await page.press("button-toggle-password");
    expect(field.getAttribute("type")).toBe("text");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(toggle.getAttribute("aria-label")).toBe(en.auth.signIn.hidePassword);
  });
});
