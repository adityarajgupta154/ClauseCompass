// @vitest-environment happy-dom
import { act, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { detectSafetyCues } from "@workspace/rules";
import { JourneyRoutes } from "@/App";
import { AuthProvider } from "@/features/auth/auth-context";
import { copy } from "@/features/journey/copy";
import { JourneyProvider, useJourney } from "@/features/journey/journey-context";
import { SAMPLE_ANSWERS } from "@/features/journey/sample-answers";
import { preloadScreens } from "@/features/journey/screens";
import { signInTestReader } from "../support/auth";

/**
 * The safety-escalation screen's acceptance (Task 5.3, PRD §8), on the
 * mounted journey: the real route table, provider and guards, driven from
 * the interview screen with a fixture answer in a DOM, with the API stubbed
 * so every request the journey would make is on record. Proves that the
 * fixture routes straight to the safety screen, that the only request on
 * the wire is the session's deletion, that every other address yields to
 * that screen afterwards (refresh included), and that the calm fixture
 * goes on to the map as before. The pure pieces — decision, stored shape,
 * the screen's body — are pinned in escalation-fixtures.test.ts.
 */

const SESSION_ID = "sess_fixture_5_3";
const JOURNEY_PATHS = ["/", "/upload", "/interview", "/map", "/review", "/compare", "/packet", "/ask", "/nowhere-in-particular"];

type Recorded = { method: string; url: string };
const requests: Recorded[] = [];
let deletionAnswer: "confirmed" | "offline" = "confirmed";

function fixture(id: string) {
  const found = SAMPLE_ANSWERS.find((answer) => answer.id === id);
  if (found === undefined) throw new Error(`no fixture ${id}`);
  return found;
}

/** Puts the journey where the interview screen expects it: a stage, its document, an open session — what the upload screen would have done. */
function Seed() {
  const { setStage, setDocument, setSession } = useJourney();
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    setStage("problem-started");
    setDocument("primary", new File(["A rent agreement, for the test."], "rent-agreement.txt", { type: "text/plain" }));
    setSession({
      id: SESSION_ID,
      stage: "problem-started",
      ttlMinutes: 30,
      expiresAt: new Date(Date.now() + 30 * 60_000),
      documents: [],
      outputs: { documentMap: false, reviewPrompts: false, compare: false },
    });
  }, [setStage, setDocument, setSession]);
  return null;
}

interface Mounted {
  root: Root;
  container: HTMLElement;
  location: ReturnType<typeof memoryLocation>;
  at: () => string;
  byTestId: (id: string) => HTMLElement | null;
  settle: () => Promise<void>;
}

const mounted: Mounted[] = [];

async function mount({ path, seed }: { path: string; seed: boolean }): Promise<Mounted> {
  await signInTestReader();
  const location = memoryLocation({ path, record: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const settle = async () => {
    // Effects, then the promises they started (the API stub answers on the microtask queue), then the renders those cause.
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
                {routes && <JourneyRoutes />}
              </JourneyProvider>
            </AuthProvider>
          </Router>
        </QueryClientProvider>,
      );
    });
  // The seed lands before any route renders, as the upload screen's work would have; the provider instance is the same across both renders.
  if (seed) await render(false);
  await render(true);
  await settle();
  const handle: Mounted = {
    root,
    container,
    location,
    at: () => location.history?.at(-1) ?? "",
    byTestId: (id) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`),
    settle,
  };
  mounted.push(handle);
  return handle;
}

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

/** The journey's sessionStorage entry, found by shape rather than by key: the key is the provider's own business. */
function storedJourney(): { raw: string; value: { stage: unknown; sessionId: unknown; safety: unknown } } | null {
  for (let i = 0; i < window.sessionStorage.length; i += 1) {
    const key = window.sessionStorage.key(i);
    const raw = key === null ? null : window.sessionStorage.getItem(key);
    if (raw === null) continue;
    try {
      const value = JSON.parse(raw);
      if (value && typeof value === "object" && "stage" in value && "safety" in value) return { raw, value };
    } catch {
      // not ours
    }
  }
  return null;
}

function expectNoWayOn(page: Mounted) {
  expect(page.byTestId("text-safety-heading")).not.toBeNull();
  for (const id of ["input-situation", "button-continue-to-map", "button-continue-to-compare", "button-sample-answer-threat-of-violence"]) {
    expect(page.byTestId(id), id).toBeNull();
  }
  expect(page.container.querySelector('input[type="file"]')).toBeNull();
  for (const anchor of page.container.querySelectorAll("a")) {
    const href = anchor.getAttribute("href") ?? "";
    expect(JOURNEY_PATHS.includes(href), `link to ${href} on the safety screen`).toBe(false);
  }
}

// The screens after the welcome are fetched on first use in the app; here they are fetched once up front, so a mount renders its screen rather than the loading line.
beforeAll(async () => {
  await preloadScreens();
});

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  requests.length = 0;
  deletionAnswer = "confirmed";
  window.sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      requests.push({ method, url });
      if (method === "DELETE" && url === `/api/sessions/${SESSION_ID}`) {
        if (deletionAnswer === "offline") throw new TypeError("Failed to fetch");
        return new Response(null, { status: 204 });
      }
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
  vi.unstubAllGlobals();
});

describe("a fixture answer with the escalation trigger", () => {
  it("routes from the interview straight to the safety screen, with the session's deletion the only request", async () => {
    const page = await mount({ path: "/interview", seed: true });
    expect(page.at()).toBe("/interview");
    expect(page.byTestId("input-situation")).not.toBeNull();
    expect(requests).toEqual([]);

    const sample = fixture("threat-of-violence");
    await click(page, `button-sample-answer-${sample.id}`);
    expect((page.byTestId("input-situation") as HTMLTextAreaElement).value).toBe(sample.text);
    await click(page, "button-continue-to-map");

    expect(page.at()).toBe("/safety");
    // The interview entry was replaced, so Back does not return to the question.
    expect(page.location.history).toEqual(["/safety"]);
    expectNoWayOn(page);
    expect(page.byTestId("text-safety-heading")?.textContent).toBe(copy.safety.heading);
    expect(page.container.textContent).toContain(copy.safety.categories.danger.heading);
    expect(page.byTestId("link-more-safety-help")?.getAttribute("href")).toBe("/help?concern=safety");

    // No analysis was asked for: nothing reached the session's map, prompts or comparison; the session itself was deleted.
    expect(requests).toEqual([{ method: "DELETE", url: `/api/sessions/${SESSION_ID}` }]);
    expect(page.byTestId("text-document-fate")?.textContent).toBe(`${copy.safety.document.notAnalysed} ${copy.safety.document.deleted}`);

    // What the tab keeps: the escalation without the words, no session.
    const stored = storedJourney();
    expect(stored).not.toBeNull();
    expect(stored?.value).toEqual({
      stage: "problem-started",
      sessionId: null,
      safety: { category: "danger", guidance: ["emergency-services", "police"], origin: "interview" },
    });
    for (const cue of detectSafetyCues(sample.text)) expect(stored?.raw).not.toContain(cue.matched);
    expect(stored?.raw).not.toContain(sample.text);
    expect(page.container.textContent).not.toContain(sample.text);
    for (const cue of detectSafetyCues(sample.text)) expect(page.container.textContent).not.toContain(cue.matched);

    // Every other address yields to the safety screen; the helplines stay open.
    for (const path of JOURNEY_PATHS) {
      await goTo(page, path);
      expect(page.at(), `after navigating to ${path}`).toBe("/safety");
      expectNoWayOn(page);
    }
    await goTo(page, "/help?concern=safety");
    expect(page.at()).toBe("/help?concern=safety");
    expect(page.byTestId("text-safety-heading")).toBeNull();
    expect(requests).toHaveLength(1);

    // A refresh restores the escalated flow before anything else renders.
    const reopened = await mount({ path: "/upload", seed: false });
    expect(reopened.at()).toBe("/safety");
    expectNoWayOn(reopened);
    expect(reopened.container.textContent).toContain(copy.safety.categories.danger.heading);
    expect(requests).toHaveLength(1);

    // The one exit: start again from the beginning, which is the Welcome screen with nothing kept.
    await click(reopened, "button-start-over");
    expect(reopened.at()).toBe("/");
    expect(reopened.byTestId("text-product-name")).not.toBeNull();
    expect(storedJourney()).toBeNull();
    expect(requests).toHaveLength(1);
  });

  it("says when the deletion could not be confirmed, naming the retention window instead", async () => {
    deletionAnswer = "offline";
    const page = await mount({ path: "/interview", seed: true });
    await click(page, `button-sample-answer-${fixture("coercion-passport").id}`);
    await click(page, "button-continue-to-map");

    expect(page.at()).toBe("/safety");
    expectNoWayOn(page);
    expect(page.container.textContent).toContain(copy.safety.categories.coercion.heading);
    expect(requests).toEqual([{ method: "DELETE", url: `/api/sessions/${SESSION_ID}` }]);
    expect(page.byTestId("text-document-fate")?.textContent).toBe(`${copy.safety.document.notAnalysed} ${copy.safety.document.unconfirmed(30)}`);
    expect(page.byTestId("text-document-fate")?.textContent).toContain("30 minutes");
  });
});

describe("a fixture answer with nobody in danger", () => {
  it("goes on to the map as before, keeping the session and the interview in history", async () => {
    const page = await mount({ path: "/interview", seed: true });
    await click(page, `button-sample-answer-${fixture("dispute-no-danger").id}`);
    await click(page, "button-continue-to-map");

    expect(page.at()).toBe("/map");
    expect(page.location.history).toEqual(["/interview", "/map"]);
    expect(page.byTestId("text-safety-heading")).toBeNull();
    // The map asks for the analysis: proof the stub would have seen it had the escalating fixture gone on.
    expect(requests.some((request) => request.url === `/api/sessions/${SESSION_ID}/document-map`)).toBe(true);
    expect(requests.some((request) => request.method === "DELETE")).toBe(false);
    expect(storedJourney()?.value).toEqual({ stage: "problem-started", sessionId: SESSION_ID, safety: null });

    // Nothing escalated, so the safety screen itself is not a place to be.
    await goTo(page, "/safety");
    expect(page.at()).toBe("/");
  });
});
