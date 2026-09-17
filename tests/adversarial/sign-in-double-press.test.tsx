// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { JourneyRoutes } from "@/App";
import { authClient } from "@/features/auth/auth-client";
import { AuthProvider } from "@/features/auth/auth-context";
import { JourneyProvider } from "@/features/journey/journey-context";
import { preloadScreens } from "@/features/journey/screens";
import { signOutTestReader } from "../support/auth";

/**
 * The sign-in screen's buttons stay in the page while a request runs (they
 * are aria-disabled, never disabled, so focus is kept), which means a second
 * press still reaches them. One request at a time is the screen's own job:
 * a double press on Google must not open two sign-in windows or race one
 * provider against another, and the form must not change what it does
 * while an answer is on its way to it.
 */

const mounted: { root: Root; container: HTMLElement }[] = [];

/** The mock client answers within a microtask; this holds one answer back until the test lets go. */
function held(): { release: () => void; promise: Promise<void> } {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { release, promise };
}

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
  return { byTestId, settle, path: () => new URL(location.history?.at(-1) ?? "", "http://journey.test").pathname };
}

beforeAll(async () => {
  await preloadScreens();
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
  window.sessionStorage.clear();
});

describe("one sign-in request at a time", () => {
  it("starts one Google sign-in for two presses, and one only while the first is still running", async () => {
    const page = await mountSignedOut();
    const gate = held();
    const original = authClient.signInWithGoogle.bind(authClient);
    const google = vi.spyOn(authClient, "signInWithGoogle").mockImplementation(async () => {
      await gate.promise;
      await original();
    });

    const button = page.byTestId("button-sign-in-google");
    await act(async () => {
      button.click();
      button.click();
    });
    await page.settle();
    expect(google).toHaveBeenCalledTimes(1);
    expect(button.getAttribute("aria-disabled")).toBe("true");

    // A press after React has shown the busy state is turned away the same way, and so is a mode switch.
    await act(async () => button.click());
    await act(async () => page.byTestId("button-mode-create").click());
    await page.settle();
    expect(google).toHaveBeenCalledTimes(1);
    expect(page.byTestId("button-sign-in-submit").textContent).toContain("One moment");
    expect(page.byTestId("button-mode-create").getAttribute("aria-disabled")).toBe("true");

    // Let the request finish: the reader is signed in and sent on, as with a single press.
    gate.release();
    await page.settle();
    expect(page.path()).not.toBe("/sign-in");
  });

  it("does not let an e-mail request and a Google request run together", async () => {
    const page = await mountSignedOut();
    const gate = held();
    const email = vi.spyOn(authClient, "signInWithEmail").mockImplementation(async () => {
      await gate.promise;
    });
    const google = vi.spyOn(authClient, "signInWithGoogle");

    await act(async () => {
      const field = page.byTestId("input-email") as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(field, "asha.verma@example.com");
      field.dispatchEvent(new Event("input", { bubbles: true }));
      const password = page.byTestId("input-password") as HTMLInputElement;
      setter?.call(password, "correct horse");
      password.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => page.byTestId("button-sign-in-submit").click());
    await act(async () => page.byTestId("button-sign-in-google").click());
    await page.settle();
    expect(email).toHaveBeenCalledTimes(1);
    expect(google).not.toHaveBeenCalled();

    gate.release();
    await page.settle();
  });
});
