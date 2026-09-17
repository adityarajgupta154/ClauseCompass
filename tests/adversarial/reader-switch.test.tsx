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
import { JourneyProvider, sessionQueryKey, useJourney } from "@/features/journey/journey-context";
import { SAMPLE_ANSWERS } from "@/features/journey/sample-answers";
import { preloadScreens } from "@/features/journey/screens";
import { signInTestReader } from "../support/auth";

/**
 * One tab, two readers. The reader who opened a document is signed out
 * without this tab's sign-out control (from another tab, or the sign-in
 * lapsed) and somebody else signs in here. Nothing of the first reader's
 * document may reach the second: not the file, not the session, not the
 * outputs the query cache still holds (they never go stale on their own),
 * and no screen may show them in the meantime. The API would refuse the
 * second reader anyway (another reader's session is a 404); this pins the
 * browser side, where a cached answer needs no API at all. The session is
 * not deleted on the server from here: the token that could have done so
 * went with the first reader, and the retention window ends it.
 */

const SESSION_ID = "sess_reader_switch";
const FILE_NAME = "rent-agreement-of-reader-one.txt";
const CACHED_SENTENCE = "The tenant pays a deposit of two months' rent.";

type Recorded = { method: string; url: string; authorization: string | null };
const requests: Recorded[] = [];

/** Puts the journey where the first reader left it: a stage, the document, an open session. */
function Seed() {
  const { setStage, setDocument, setSession } = useJourney();
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    setStage("problem-started");
    setDocument("primary", new File(["A rent agreement, for the test."], FILE_NAME, { type: "text/plain" }));
    setSession({
      id: SESSION_ID,
      stage: "problem-started",
      ttlMinutes: 30,
      expiresAt: new Date(Date.now() + 30 * 60_000),
      documents: [],
      outputs: { documentMap: true, reviewPrompts: false, compare: false },
    });
  }, [setStage, setDocument, setSession]);
  return null;
}

const seen: { session: string | null; files: string[]; stage: string | null; escalated: boolean } = { session: null, files: [], stage: null, escalated: false };

/** Mirrors the journey's state for the assertions, once each commit has landed (every mount and update here runs inside act()). */
function Probe() {
  const { session, documents, stage, escalated } = useJourney();
  useEffect(() => {
    seen.session = session?.id ?? null;
    seen.files = Object.values(documents).flatMap((file) => (file ? [file.name] : []));
    seen.stage = stage;
    seen.escalated = escalated;
  });
  return null;
}

interface Mounted {
  root: Root;
  container: HTMLElement;
  client: QueryClient;
  location: ReturnType<typeof memoryLocation>;
  at: () => string;
  byTestId: (id: string) => HTMLElement | null;
  settle: () => Promise<void>;
}

const mounted: Mounted[] = [];

async function mount(path: string, { seed = true, signedIn = true } = {}): Promise<Mounted> {
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
          <Router hook={location.hook}>
            <AuthProvider>
              <JourneyProvider>
                {seed && <Seed />}
                <Probe />
                <PrincipalBoundary>{routes && <JourneyRoutes />}</PrincipalBoundary>
              </JourneyProvider>
            </AuthProvider>
          </Router>
        </QueryClientProvider>,
      );
    });
  await render(false);
  // What the first reader's map screen would have cached: an output for the session, kept for as long as the tab lives.
  if (seed) client.setQueryData([...sessionQueryKey(SESSION_ID), "document-map"], { fields: [{ statement: CACHED_SENTENCE }] });
  await render(true);
  await settle();
  const handle: Mounted = {
    root,
    container,
    client,
    location,
    at: () => location.history?.at(-1) ?? "",
    byTestId: (id) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`),
    settle,
  };
  mounted.push(handle);
  return handle;
}

const cachedForSession = (client: QueryClient) => client.getQueryCache().findAll({ queryKey: sessionQueryKey(SESSION_ID) }).length;

async function goTo(page: Mounted, path: string) {
  await act(async () => page.location.navigate(path));
  await page.settle();
}

async function click(page: Mounted, testId: string) {
  const element = page.byTestId(testId);
  if (element === null) throw new Error(`nothing on screen with data-testid="${testId}" at ${page.at()}`);
  await act(async () => element.click());
  await page.settle();
}

/** The sign-out this tab did not ask for: another tab's, or a lapsed sign-in. The mock client tells its subscribers like Firebase would. */
async function signedOutElsewhere(page: Mounted) {
  await act(async () => authClient.signOut());
  await page.settle();
}

async function secondReaderSignsIn(page: Mounted) {
  await act(async () => authClient.signInWithEmail("reader.two@example.com", "a-password-of-six"));
  await page.settle();
}

// The screens after the welcome are fetched on first use in the app; here they are fetched once up front, so a mount renders its screen rather than the loading line.
beforeAll(async () => {
  await preloadScreens();
});

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  requests.length = 0;
  window.sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      const headers = new Headers(init?.headers);
      requests.push({ method, url, authorization: headers.get("authorization") });
      if (method === "DELETE" && url === `/api/sessions/${SESSION_ID}`) return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ error: { code: "test-stub", message: "Not part of this test." } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
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

describe("when the reader who opened the document is signed out from elsewhere", () => {
  it("forgets the document, the session and its cached outputs at once, and shows the next reader none of it", async () => {
    const page = await mount("/interview");
    expect(page.at()).toBe("/interview");
    expect(seen).toMatchObject({ session: SESSION_ID, files: [FILE_NAME], stage: "problem-started" });
    expect(cachedForSession(page.client)).toBe(1);
    expect(requests).toEqual([]);

    await signedOutElsewhere(page);

    // The journey is gone with the reader — no file, no session, no situation, no cached output — so the tab is back at the start (the stage guard sits outside the sign-in gate: no stage means the start, not sign-in). Nothing went to the server: there is no token left to end the session with.
    expect(page.at()).toBe("/");
    expect(page.byTestId("input-situation")).toBeNull();
    expect(seen).toMatchObject({ session: null, files: [], stage: null });
    expect(cachedForSession(page.client)).toBe(0);
    expect(requests).toEqual([]);
    expect(page.container.textContent).not.toContain(FILE_NAME);

    // Somebody else signs in on the same tab and heads for the map: there is no document to open and nothing cached to show.
    await secondReaderSignsIn(page);
    expect(page.at()).toBe("/");
    for (const path of ["/map", "/interview", "/upload"]) {
      await goTo(page, path);
      expect(page.at(), `after navigating to ${path}`).toBe("/");
      expect(page.container.textContent).not.toContain(FILE_NAME);
      expect(page.container.textContent).not.toContain(CACHED_SENTENCE);
    }
    expect(seen).toMatchObject({ session: null, files: [], stage: null });
    expect(cachedForSession(page.client)).toBe(0);
    // Nothing about the first reader's session was ever asked with the second reader's token.
    expect(requests.filter((request) => request.url.includes(SESSION_ID))).toEqual([]);
  });

  it("keeps the safety screen where the flow had escalated: it never depends on who is signed in", async () => {
    const page = await mount("/interview");
    const sample = SAMPLE_ANSWERS.find((answer) => answer.id === "threat-of-violence");
    if (sample === undefined) throw new Error("no threat-of-violence fixture");
    await click(page, `button-sample-answer-${sample.id}`);
    await click(page, "button-continue-to-map");
    expect(page.at()).toBe("/safety");
    expect(seen.escalated).toBe(true);
    expect(requests).toEqual([{ method: "DELETE", url: `/api/sessions/${SESSION_ID}`, authorization: `Bearer mock:${"mock-google-reader"}` }]);

    await signedOutElsewhere(page);
    expect(page.at()).toBe("/safety");
    expect(page.byTestId("text-safety-heading")).not.toBeNull();
    expect(seen.escalated).toBe(true);
    // The session had already been ended by the escalation; the sign-out has nothing more to delete.
    expect(requests).toHaveLength(1);

    await secondReaderSignsIn(page);
    expect(page.at()).toBe("/safety");
    expect(page.byTestId("text-safety-heading")).not.toBeNull();
  });
});

describe("when somebody else signs in over an open journey, with no sign-out in between", () => {
  it("forgets the first reader's journey all the same", async () => {
    const page = await mount("/interview");
    expect(seen).toMatchObject({ session: SESSION_ID, files: [FILE_NAME], stage: "problem-started" });

    await secondReaderSignsIn(page);
    expect(page.at()).toBe("/");
    expect(seen).toMatchObject({ session: null, files: [], stage: null });
    expect(cachedForSession(page.client)).toBe(0);
    // Not even a deletion goes out in the second reader's name for the first reader's session.
    expect(requests.filter((request) => request.url.includes(SESSION_ID))).toEqual([]);
    for (const path of ["/map", "/interview"]) {
      await goTo(page, path);
      expect(page.at(), `after navigating to ${path}`).toBe("/");
      expect(page.container.textContent).not.toContain(FILE_NAME);
      expect(page.container.textContent).not.toContain(CACHED_SENTENCE);
    }
  });
});

describe("the first sign-in of a visit", () => {
  it("keeps the situation chosen on the way to the sign-in screen: there was no reader to forget", async () => {
    const page = await mount("/", { seed: false, signedIn: false });
    await click(page, "button-stage-problem-started");
    // The upload screen is gated: a signed-out visitor is sent to sign in, and comes back to it.
    expect(page.at()).toBe(`/sign-in?next=${encodeURIComponent("/upload")}`);
    expect(seen.stage).toBe("problem-started");

    await secondReaderSignsIn(page);
    expect(page.at()).toBe("/upload");
    expect(seen.stage).toBe("problem-started");
    expect(page.container.querySelector('input[type="file"]')).not.toBeNull();
  });
});
