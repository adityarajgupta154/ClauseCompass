// @vitest-environment happy-dom
import { act, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { JourneyRoutes } from "@/App";
import { AuthProvider } from "@/features/auth/auth-context";
import { en } from "@/features/journey/copy";
import { JourneyProvider, useJourney } from "@/features/journey/journey-context";
import { preloadScreens } from "@/features/journey/screens";
import { QUESTION_MAX_LENGTH } from "@/pages/ask";
import { signInTestReader } from "../support/auth";

/**
 * The Ask screen (PRD §5 step 5, FR-08, §8 "question unsupported by the document") on
 * the mounted journey: the real route table, guards and provider, with the
 * API stubbed so what goes over the wire is on record. Pins that a question
 * reaches the API as data and comes back as source cards over the passages
 * the API read; that a refusal shows the reason and hands the question back
 * for a professional, never a guess; that a safety cue in the question opens
 * the safety screen without sending it; that the API's own failures are
 * shown as they are, an ended session as an ended session; and that the
 * screen keeps nothing the server could see: no question is cached.
 */

const SESSION_ID = "sess_ask_screen";
const PASSAGE = {
  id: "p7",
  text: "Either party may terminate this agreement by giving one month's written notice to the other.",
  location: { page: 1, paragraph: 7, clause: "9" },
};
const DOCUMENT = { kind: "rent-agreement", pageCount: 1, wordCount: 200, paragraphCount: 12 };

type Recorded = { method: string; url: string; body: unknown };
const requests: Recorded[] = [];
let answerWith: (question: string) => Response = () => new Response(null, { status: 500 });

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const answered = (style: "brief" | "full", withheld = 0) =>
  json(200, {
    document: DOCUMENT,
    status: "answered",
    reason: null,
    suggestedQuestion: null,
    style,
    claims: [
      {
        text: "Either side can end the agreement with one month's written notice.",
        quote: "one month's written notice",
        source_chunk_ids: [PASSAGE.id],
        location: PASSAGE.location,
        confidence: 0.9,
        category: "answer",
      },
    ],
    passages: [PASSAGE],
    withheld,
  });

const refused = (reason: "no-evidence" | "nothing-verified" | "low-confidence", question: string) =>
  json(200, {
    document: DOCUMENT,
    status: "not-in-document",
    reason,
    suggestedQuestion: question,
    style: "full",
    claims: [],
    passages: reason === "no-evidence" ? [] : [PASSAGE],
    withheld: 0,
  });

/** Puts the journey where the Ask screen expects it: a stage, its document, an open session. */
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
  allByTestId: (id: string) => HTMLElement[];
  settle: () => Promise<void>;
}

const mounted: Mounted[] = [];

async function mount(path = "/ask"): Promise<Mounted> {
  await signInTestReader();
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
                <Seed />
                {routes && <JourneyRoutes />}
              </JourneyProvider>
            </AuthProvider>
          </Router>
        </QueryClientProvider>,
      );
    });
  await render(false);
  await render(true);
  await settle();
  const handle: Mounted = {
    root,
    container,
    location,
    at: () => location.history?.at(-1) ?? "",
    byTestId: (id) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`),
    allByTestId: (id) => Array.from(container.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)),
    settle,
  };
  mounted.push(handle);
  return handle;
}

function field(page: Mounted): HTMLTextAreaElement {
  const element = page.byTestId("input-question");
  if (element === null) throw new Error(`no question field at ${page.at()}`);
  return element as HTMLTextAreaElement;
}

async function type(page: Mounted, text: string) {
  const element = field(page);
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(element, text);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click(page: Mounted, testId: string) {
  const element = page.byTestId(testId);
  if (element === null) throw new Error(`nothing on screen with data-testid="${testId}" at ${page.at()}`);
  await act(async () => element.click());
  await page.settle();
}

async function askQuestion(page: Mounted, text: string) {
  await type(page, text);
  await click(page, "button-ask");
}

const askRequests = () => requests.filter((request) => request.method === "POST" && request.url === `/api/sessions/${SESSION_ID}/ask`);

beforeAll(async () => {
  await preloadScreens();
});

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  requests.length = 0;
  answerWith = () => json(500, { error: { code: "test-stub", message: "Not part of this test." } });
  window.sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      requests.push({ method, url, body });
      if (method === "DELETE" && url === `/api/sessions/${SESSION_ID}`) return new Response(null, { status: 204 });
      if (method === "POST" && url === `/api/sessions/${SESSION_ID}/ask`) return answerWith(body.question);
      return json(500, { error: { code: "test-stub", message: "Not part of this test." } });
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

describe("asking about the document", () => {
  it("sends the question as data with the flow's style, and shows the answer as source cards over the passages the API read", async () => {
    answerWith = () => answered("full");
    const page = await mount();
    expect(page.at()).toBe("/ask");
    expect(field(page).maxLength).toBe(QUESTION_MAX_LENGTH);
    expect((page.byTestId("button-ask") as HTMLButtonElement).disabled).toBe(true);

    await askQuestion(page, "  What is the notice period?  ");

    expect(askRequests()).toEqual([{ method: "POST", url: `/api/sessions/${SESSION_ID}/ask`, body: { question: "What is the notice period?", style: "full" } }]);
    expect(page.byTestId("text-ask-question")?.textContent).toBe("What is the notice period?");
    expect(page.byTestId("text-answer")).not.toBeNull();
    const cards = page.allByTestId("source-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]?.textContent).toContain("Either side can end the agreement with one month's written notice.");
    expect(cards[0]?.textContent).toContain(PASSAGE.text);
    expect(page.byTestId("text-answer-brief")).toBeNull();
    expect(page.byTestId("text-ask-withheld")).toBeNull();
    // The field is cleared for the next question; the answered one stays on screen.
    expect(field(page).value).toBe("");
  });

  it("keeps every exchange of the visit on screen, each answered on its own, and says when statements were withheld", async () => {
    answerWith = (question) => (question.includes("withheld") ? answered("full", 2) : answered("full"));
    const page = await mount();
    await askQuestion(page, "What is the notice period?");
    await askQuestion(page, "How many were withheld?");
    expect(page.allByTestId("text-ask-exchange")).toHaveLength(2);
    expect(askRequests().map((request) => (request.body as { question: string }).question)).toEqual(["What is the notice period?", "How many were withheld?"]);
    expect(page.byTestId("text-ask-withheld")?.textContent).toBe(en.ask.answer.withheld(2));
  });

  it("names the brief style when the answer came back brief", async () => {
    answerWith = () => answered("brief");
    const page = await mount();
    await askQuestion(page, "What is the notice period?");
    expect(page.byTestId("text-answer-brief")?.textContent).toBe(en.ask.answer.brief);
  });

  it("fills the field from a sample question and announces it; nothing is sent until Ask is pressed", async () => {
    const page = await mount();
    await click(page, "button-sample-question-1");
    expect(field(page).value).toBe(en.ask.question.sampleQuestions[0]);
    expect(page.byTestId("status-sample-question")?.textContent).toBe(en.ask.question.sampleQuestions[0]);
    expect(askRequests()).toEqual([]);
  });

  it("withholds a statement that cites a passage the API did not send, rather than showing it unverified", async () => {
    answerWith = () =>
      json(200, {
        document: DOCUMENT,
        status: "answered",
        reason: null,
        suggestedQuestion: null,
        style: "full",
        claims: [
          {
            text: "The deposit is returned within a week.",
            quote: "returned within a week",
            source_chunk_ids: ["p99"],
            location: PASSAGE.location,
            confidence: 0.9,
            category: "answer",
          },
        ],
        passages: [PASSAGE],
        withheld: 0,
      });
    const page = await mount();
    await askQuestion(page, "When is the deposit returned?");
    expect(page.allByTestId("source-card")).toHaveLength(0);
    expect(page.container.textContent).toContain(en.sourceCard.fallback.title);
    expect(page.container.textContent).not.toContain("The deposit is returned within a week.");
  });
});

describe("a question the document does not answer", () => {
  it.each(["no-evidence", "nothing-verified", "low-confidence"] as const)("shows the %s reason and hands the question back for a professional", async (reason) => {
    answerWith = (question) => refused(reason, question);
    const page = await mount();
    await askQuestion(page, "Is Pluto a planet?");
    expect(page.byTestId("text-answer")).toBeNull();
    expect(page.allByTestId("source-card")).toHaveLength(0);
    expect(page.byTestId("text-not-in-document")?.textContent).toContain(en.ask.notInDocument.title);
    expect(page.byTestId("text-not-in-document-reason")?.textContent).toBe(en.ask.notInDocument.reasons[reason]);
    expect(page.byTestId("text-suggested-question")?.textContent).toBe("Is Pluto a planet?");
    expect(page.byTestId("link-ask-help")?.getAttribute("href")).toBe("/help?concern=legal-advice");
  });
});

describe("a safety cue in the question", () => {
  it("opens the safety screen without sending the question; the session's deletion is the only request", async () => {
    const page = await mount();
    await askQuestion(page, "What is the notice period? He said he will beat me if I leave.");
    expect(page.at()).toBe("/safety");
    expect(page.location.history).toEqual(["/safety"]);
    expect(page.byTestId("text-safety-heading")).not.toBeNull();
    expect(askRequests()).toEqual([]);
    expect(requests.map((request) => [request.method, request.url])).toEqual([["DELETE", `/api/sessions/${SESSION_ID}`]]);
  });
});

describe("when the API cannot answer", () => {
  it("shows the API's own message for a refusal or an unavailable model, and asks again on request", async () => {
    let calls = 0;
    answerWith = () => {
      calls += 1;
      return calls === 1
        ? json(503, { error: { code: "model-unavailable", message: "The AI model could not be reached. Nothing was prepared; try again in a moment." } })
        : answered("full");
    };
    const page = await mount();
    await askQuestion(page, "What is the notice period?");
    expect(page.byTestId("text-ask-error")?.textContent).toContain(en.ask.errors.title);
    expect(page.byTestId("text-ask-error")?.textContent).toContain("The AI model could not be reached. Nothing was prepared; try again in a moment.");
    expect(page.byTestId("text-answer")).toBeNull();

    await click(page, "button-retry-ask");
    expect(askRequests()).toHaveLength(2);
    expect(page.allByTestId("text-ask-exchange")).toHaveLength(1);
    expect(page.byTestId("text-ask-error")).toBeNull();
    expect(page.byTestId("text-answer")).not.toBeNull();
  });

  it("does not repeat an unexpected failure's status or body; the generic sentence is shown", async () => {
    answerWith = () => json(500, { error: { code: "internal", message: "TypeError: cannot read properties of undefined" } });
    const page = await mount();
    await askQuestion(page, "What is the notice period?");
    expect(page.byTestId("text-ask-error")?.textContent).toContain(en.analysis.errors.generic);
    expect(page.container.textContent).not.toContain("TypeError");
  });

  it("treats a session the server no longer has as an ended session: the way on is the upload screen, not a retry", async () => {
    answerWith = () => json(404, { error: { code: "session-not-found", message: "This session has ended. Upload the document again to continue." } });
    const page = await mount();
    await askQuestion(page, "What is the notice period?");
    expect(page.byTestId("text-ask-error")?.textContent).toContain("This session has ended.");
    expect(page.byTestId("button-retry-ask")).toBeNull();
    expect(page.byTestId("button-upload-again")).not.toBeNull();
  });
});

describe("the way in", () => {
  it("is linked from the map, the review prompts and the comparison, and its back link returns to the map", async () => {
    const page = await mount();
    expect(page.byTestId("link-back-to-map")?.getAttribute("href")).toBe("/map");
    expect(page.byTestId("text-ask-document")?.textContent).toContain("rent-agreement.txt");
  });

  it("forgets the visit's questions when the reader leaves: nothing is cached to come back to", async () => {
    answerWith = () => answered("full");
    const page = await mount();
    await askQuestion(page, "What is the notice period?");
    expect(page.allByTestId("text-ask-exchange")).toHaveLength(1);
    await act(async () => page.location.navigate("/help"));
    await page.settle();
    await act(async () => page.location.navigate("/ask"));
    await page.settle();
    expect(page.at()).toBe("/ask");
    expect(page.allByTestId("text-ask-exchange")).toHaveLength(0);
    expect(askRequests()).toHaveLength(1);
  });
});
