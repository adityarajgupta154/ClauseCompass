// @vitest-environment happy-dom
import { act, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { JourneyRoutes } from "@/App";
import { authClient } from "@/features/auth/auth-client";
import { AuthProvider } from "@/features/auth/auth-context";
import { PrincipalBoundary } from "@/features/auth/principal-boundary";
import { GATED_PATHS, nextPathFrom } from "@/features/auth/require-auth";
import { JourneyProvider, useJourney } from "@/features/journey/journey-context";
import { preloadScreens } from "@/features/journey/screens";
import { signInTestReader } from "../support/auth";

/**
 * Deep links into the journey. Every screen from the upload on is behind
 * three gates — a signed-in reader, a stage chosen on the Welcome screen
 * (below the information-not-advice boundary), and the documents plus the
 * session the stage needs — and a link that skips one lands on the screen
 * that supplies it, never on the gated screen. The sign-in return address
 * is one of our own paths or nothing, so a crafted link cannot send a
 * reader elsewhere after signing in, and all of it holds when the app is
 * served below a base path, as it is on Replit.
 */

/** Puts the journey where a reader who chose a stage (and, optionally, uploaded) would be. */
function Seed({ withSession }: { withSession: boolean }) {
  const { setStage, setDocument, setSession } = useJourney();
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    setStage("before-signing");
    if (!withSession) return;
    setDocument("primary", new File(["An offer letter, for the test."], "offer.txt", { type: "text/plain" }));
    setSession({
      id: "sess_route_guards",
      stage: "before-signing",
      ttlMinutes: 30,
      expiresAt: new Date(Date.now() + 30 * 60_000),
      documents: [],
      outputs: { documentMap: false, reviewPrompts: false, compare: false },
    });
  }, [setStage, setDocument, setSession, withSession]);
  return null;
}

interface Mounted {
  root: Root;
  container: HTMLElement;
  at: () => string;
  byTestId: (id: string) => HTMLElement | null;
  settle: () => Promise<void>;
}

const mounted: Mounted[] = [];

interface MountOptions {
  signedIn?: boolean;
  /** undefined: no stage chosen; false: a stage but no upload; true: stage, document and session. */
  seed?: boolean;
  base?: string;
}

async function mount(path: string, { signedIn = true, seed, base = "" }: MountOptions = {}): Promise<Mounted> {
  if (signedIn) await signInTestReader();
  const location = memoryLocation({ path, record: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const settle = async () => {
    for (let i = 0; i < 4; i += 1) await act(async () => {});
  };
  const render = (routes: boolean) =>
    act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <Router base={base} hook={location.hook}>
            <AuthProvider>
              <JourneyProvider>
                {seed !== undefined && <Seed withSession={seed} />}
                <PrincipalBoundary>{routes && <JourneyRoutes />}</PrincipalBoundary>
              </JourneyProvider>
            </AuthProvider>
          </Router>
        </QueryClientProvider>,
      );
    });
  // The journey state is seeded first, then the routes mount on it, as a reader arriving mid-journey would find them.
  await render(false);
  await render(true);
  await settle();
  const handle: Mounted = {
    root,
    container,
    at: () => location.history?.at(-1) ?? "",
    byTestId: (id) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`),
    settle,
  };
  mounted.push(handle);
  return handle;
}

beforeAll(async () => {
  await preloadScreens();
});

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.sessionStorage.clear();
  // No screen reached here may need the API; a call is a failure of the gate, answered so the test says which.
  // The one exception is the delete that sign-out (afterEach) sends for a seeded session.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if ((init?.method ?? "GET").toUpperCase() === "DELETE") return new Response(null, { status: 204 });
      throw new Error(`a gated screen reached the API: ${url}`);
    }),
  );
});

afterEach(async () => {
  for (const page of mounted.splice(0)) {
    await act(async () => page.root.unmount());
    page.container.remove();
  }
  await authClient.signOut();
  vi.unstubAllGlobals();
});

describe("a signed-out visitor", () => {
  it("is sent from every gated screen to sign-in, with that screen as the return address, and sees none of it", async () => {
    for (const path of GATED_PATHS) {
      const page = await mount(path, { signedIn: false, seed: true });
      expect(page.at(), path).toBe(`/sign-in?next=${encodeURIComponent(path)}`);
      expect(page.byTestId("text-sign-in-heading"), path).not.toBeNull();
      expect(page.container.textContent, path).not.toMatch(/offer\.txt/);
    }
  });

  it("can still read the Welcome and official-help screens", async () => {
    const welcome = await mount("/", { signedIn: false });
    expect(welcome.at()).toBe("/");
    expect(welcome.byTestId("text-product-name")).not.toBeNull();

    const help = await mount("/help", { signedIn: false });
    // The help screen names its default concern in the address; it is still the help screen.
    expect(help.at()).toMatch(/^\/help(\?|$)/);
    expect(help.byTestId("text-sign-in-heading")).toBeNull();
  });
});

describe("a signed-in reader who skipped a step", () => {
  it("goes back to the Welcome screen from any step when no stage was chosen there", async () => {
    for (const path of GATED_PATHS) {
      const page = await mount(path);
      expect(page.at(), path).toBe("/");
      expect(page.byTestId("text-product-name"), path).not.toBeNull();
    }
  });

  it("goes back to the upload screen from the steps after it when nothing was uploaded", async () => {
    for (const path of ["/interview", "/map", "/review", "/compare", "/packet"]) {
      const page = await mount(path, { seed: false });
      expect(page.at(), path).toBe("/upload");
    }
    // The upload screen itself is where a reader with a stage belongs.
    const upload = await mount("/upload", { seed: false });
    expect(upload.at()).toBe("/upload");
  });

  it("stays on the step when the stage, the document and the session are all there", async () => {
    const page = await mount("/interview", { seed: true });
    expect(page.at()).toBe("/interview");
  });
});

describe("the sign-in return address", () => {
  it("is only ever one of the gated screens; anything else falls back to the upload screen", () => {
    for (const path of GATED_PATHS) expect(nextPathFrom(`?next=${encodeURIComponent(path)}`)).toBe(path);
    for (const foreign of [
      "?next=https://evil.example/upload",
      "?next=//evil.example",
      "?next=/help",
      "?next=/upload/../sign-in",
      "?next=%2Fmap%3Fx%3D1",
      "?next=",
      "",
    ]) {
      expect(nextPathFrom(foreign), foreign).toBe("/upload");
    }
  });
});

describe("below a base path (the app is served at /clausecompass on Replit)", () => {
  it("sends a signed-out visitor to sign-in under the base, with an app-relative return address", async () => {
    const page = await mount("/clausecompass/review", { signedIn: false, seed: true, base: "/clausecompass" });
    expect(page.at()).toBe("/clausecompass/sign-in?next=%2Freview");
    expect(page.byTestId("text-sign-in-heading")).not.toBeNull();
  });

  it("sends a reader with no stage to the Welcome screen under the base", async () => {
    const page = await mount("/clausecompass/map", { base: "/clausecompass" });
    expect(page.at()).toBe("/clausecompass/");
    expect(page.byTestId("text-product-name")).not.toBeNull();
  });

  it("sends a reader with no upload to the upload screen under the base", async () => {
    const page = await mount("/clausecompass/map", { seed: false, base: "/clausecompass" });
    expect(page.at()).toBe("/clausecompass/upload");
  });
});
