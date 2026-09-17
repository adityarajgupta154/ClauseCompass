// @vitest-environment happy-dom
import { act, createElement, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentMapResponse, ReviewPromptsResponse, Session } from "@workspace/api-client-react";
import { CreateSessionResponse, PrepareDocumentMapResponse, PrepareReviewPromptsResponse } from "@workspace/api-zod";
import { JourneyRoutes } from "@/App";
import { AuthProvider } from "@/features/auth/auth-context";
import cardsAsset from "@/assets/footer-cards.webp";
import oliveAsset from "@/assets/footer-olive.webp";
import leafAsset from "@/assets/stage-leaf.webp";
import folderAsset from "@/assets/upload-folder.webp";
import papersAsset from "@/assets/upload-papers.webp";
import type { SlotId } from "@/features/document/slots";
import { JourneyProvider, useJourney } from "@/features/journey/journey-context";
import { preloadScreens } from "@/features/journey/screens";
import type { StageId } from "@/features/journey/stages";
import { buildPacket } from "@/features/packet/build-packet";
import { PacketDocument } from "@/features/packet/packet-document";
import { renderPacketText } from "@/features/packet/render-text";
import { adversarialFixture, FOREIGN_ELEMENTS, markupSignaturesIn, XSS_PAYLOADS } from "../support/adversarial";
import { bootApiProcess, openSession, readerHeaders, type TestApi } from "../support/api-server";
import { signInTestReader } from "../support/auth";

/**
 * Cross-site scripting through a document (PRD §9: "all rendered output is
 * escaped"). The fixture is a synthetic rent agreement whose title, party
 * names and clauses carry script tags, event handlers, javascript: links,
 * an iframe, a stylesheet that would blank the page and a dozen encodings
 * of the same; its file name carries an image with an error handler. It
 * goes through the real API and the mounted screens — map, review prompts,
 * packet, version comparison, the upload screen with the hostile file
 * name — and every payload must come out as visible text and nothing else:
 * no script element, no handler attribute, no script URL, nothing hidden,
 * the packet's download a plain-text file. The DOM here does not run
 * scripts; the structural checks are the proof, and the same walk in a
 * real browser (see tests/README.md) confirms nothing executes.
 */

const fixture = adversarialFixture("xss-clause");
const HOSTILE_FILE_NAME = `<img src=x onerror="window.__xss='name'">.txt`;
/** The newer version for the comparison: the same hostile document with the deposit raised, so at least one change is found. */
const newerVersion = (() => {
  const anchor = "security deposit of Rs. 66,000/- (Rupees Sixty-Six Thousand only)";
  if (!fixture.text.includes(anchor)) throw new Error("the XSS fixture no longer has the deposit clause the comparison changes");
  return new TextEncoder().encode(fixture.text.replace(anchor, "security deposit of Rs. 88,000/- (Rupees Eighty-Eight Thousand only)"));
})();

let api: TestApi;
let origin: string;
/** happy-dom's own fetch, kept before the stub: it reaches an absolute URL but resolves a relative one against a location nothing listens on. */
const domFetch = globalThis.fetch;

async function createdSession(stage: StageId, newer?: { fileName: string; bytes: Uint8Array }): Promise<Session> {
  const primary = { fileName: HOSTILE_FILE_NAME, bytes: fixture.bytes };
  const id = await openSession(api.baseUrl, stage, primary, newer);
  const response = await domFetch(`${api.baseUrl}/sessions/${id}`, { headers: readerHeaders() });
  expect(response.status).toBe(200);
  return CreateSessionResponse.parse(await response.json()) as Session;
}

interface SeedInput {
  stage: StageId;
  files: Partial<Record<SlotId, File>>;
  session: Session;
}

/** Puts the journey where the analysis screens expect it: a stage, its document(s), an open session — what the upload screen would have done. */
function Seed({ stage, files, session }: SeedInput) {
  const { setStage, setDocument, setSession } = useJourney();
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    setStage(stage);
    for (const [slot, file] of Object.entries(files)) setDocument(slot as SlotId, file);
    setSession(session);
  }, [setStage, setDocument, setSession, stage, files, session]);
  return null;
}

interface Mounted {
  root: Root;
  container: HTMLElement;
  at: () => string;
  byTestId: (id: string) => HTMLElement | null;
  all: (testIdPrefix: string) => HTMLElement[];
  settle: () => Promise<void>;
  /** Settles until the predicate holds or the wait runs out; the analysis screens wait on a real request to the server. */
  until: (what: string, predicate: () => boolean) => Promise<void>;
  /** Waits for the screen's own requests (the retention notice, a touch) to finish, so unmounting aborts none of them. */
  quiet: () => Promise<void>;
}

const mounted: Mounted[] = [];

async function mount(path: string, seed: SeedInput): Promise<Mounted> {
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
                <Seed {...seed} />
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
    at: () => location.history?.at(-1) ?? "",
    byTestId: (id) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`),
    all: (prefix) => Array.from(container.querySelectorAll<HTMLElement>(`[data-testid^="${prefix}"]`)),
    settle,
    until: async (what, predicate) => {
      const deadline = Date.now() + 15_000;
      while (!predicate()) {
        if (Date.now() > deadline) throw new Error(`${what} did not happen within 15s at ${handle.at()}; screen reads: ${container.textContent?.slice(0, 300)}`);
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 25));
        });
      }
      await settle();
    },
    quiet: () => handle.until("the screen's requests finishing", () => client.isFetching() === 0 && client.isMutating() === 0),
  };
  mounted.push(handle);
  return handle;
}

async function clickAll(page: Mounted, testIdPrefix: string): Promise<number> {
  const buttons = page.all(testIdPrefix);
  for (const button of buttons) {
    await act(async () => button.click());
  }
  await page.settle();
  return buttons.length;
}

/**
 * Every way a payload could have become live: an element the screen never
 * renders, a handler attribute, a script URL, an outside address. Text is
 * not walked; a payload in text is the correct outcome.
 */
function liveMarkupIn(container: HTMLElement, allowedElements: readonly string[] = []): string[] {
  const issues: string[] = [];
  for (const element of container.querySelectorAll("*")) {
    const tag = element.tagName.toLowerCase();
    if ((FOREIGN_ELEMENTS as readonly string[]).includes(tag) && !allowedElements.includes(tag)) issues.push(`<${tag}> element`);
    for (const attribute of element.getAttributeNames()) {
      const value = element.getAttribute(attribute) ?? "";
      if (/^on/i.test(attribute)) issues.push(`${attribute} on <${tag}>`);
      if (/^\s*(?:javascript|data|vbscript):/i.test(value)) issues.push(`${attribute}="${value.slice(0, 30)}" on <${tag}>`);
      if (value.includes("example.invalid")) issues.push(`${attribute} pointing at example.invalid on <${tag}>`);
    }
  }
  return issues;
}

/** The payloads a screen shows as text; a screen must show at least the ones from the clauses it presents. */
function payloadsShown(container: HTMLElement): string[] {
  const text = container.textContent ?? "";
  return XSS_PAYLOADS.filter((payload) => text.includes(payload));
}

/** The payloads carried by the strings of a response that a screen always renders; each has to come out as text. */
function payloadsCarried(strings: readonly string[]): string[] {
  return XSS_PAYLOADS.filter((payload) => strings.some((text) => text.includes(payload)));
}

/** Every payload the response carries into the screen's fixed content is on the screen as text — a sink-by-sink check, not just a count. */
function expectCarriedShown(page: Mounted, carried: readonly string[], atLeast: number) {
  expect(carried.length).toBeGreaterThanOrEqual(atLeast);
  const shown = payloadsShown(page.container);
  for (const payload of carried) expect(shown, `payload not shown as text: ${payload}`).toContain(payload);
}

/** The footer's decorative olive branch and card stack, which every screen with the footer shows. */
const FOOTER_IMAGES = [oliveAsset, cardsAsset] as const;

/**
 * The screen's own pictures are the only images, exactly: the bundled assets
 * at the addresses the bundler gave them (the same imports the screens use),
 * empty alt, inside a decorative subtree. An injected <img> would point
 * elsewhere and sit in the content; so would a bundled name on a foreign host.
 */
function expectOnlyPictures(page: Mounted, pictures: readonly string[]) {
  const images = Array.from(page.container.querySelectorAll("img"));
  expect(images.map((image) => image.getAttribute("src") ?? "").sort()).toEqual([...pictures].sort());
  for (const image of images) {
    expect(image.getAttribute("alt")).toBe("");
    expect(image.closest('[aria-hidden="true"]')).not.toBeNull();
  }
}

function expectIntact(page: Mounted, allowedElements: readonly string[] = [], pictures: readonly string[] = FOOTER_IMAGES) {
  expect(liveMarkupIn(page.container, [...allowedElements, "img"])).toEqual([]);
  expectOnlyPictures(page, pictures);
  expect((window as { __xss?: unknown }).__xss).toBeUndefined();
  // The injected stylesheet did not land anywhere in the document either.
  expect(document.querySelectorAll("style, link[rel=stylesheet], base").length).toBe(0);
  expect(document.title).not.toContain("<");
}

let alerts: ReturnType<typeof vi.fn>;

// The screens after the welcome are fetched on first use in the app; here they are fetched once up front, so a mount renders its screen rather than the loading line.
beforeAll(async () => {
  await preloadScreens();
});

beforeAll(async () => {
  api = await bootApiProcess();
  origin = api.baseUrl.replace(/\/api$/, "");
  // The page is served from the API's own origin, as in production (the API grants no cross-origin access by
  // default, and happy-dom's fetch enforces the same-origin policy like a browser would).
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(`${origin}/`);
});

afterAll(async () => {
  await api.close();
});

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.sessionStorage.clear();
  delete (window as { __xss?: unknown }).__xss;
  alerts = vi.fn();
  vi.stubGlobal("alert", alerts);
  // The screens ask for "/api/..." on the page's own origin; here that origin is the booted server.
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return domFetch(url.startsWith("/") ? `${origin}${url}` : url, init);
    }),
  );
});

afterEach(async () => {
  for (const page of mounted.splice(0)) {
    // An aborted request is logged by happy-dom's fetch as a socket error; let the screen's own finish first.
    await page.quiet();
    await act(async () => page.root.unmount());
    page.container.remove();
  }
  vi.unstubAllGlobals();
  expect(alerts).not.toHaveBeenCalled();
});

const hostileFile = () => new File([new Uint8Array(fixture.bytes)], HOSTILE_FILE_NAME, { type: "text/plain" });

describe("the hostile document on the analysis screens", () => {
  let session: Session;
  let seed: SeedInput;
  let map: DocumentMapResponse;
  let review: ReviewPromptsResponse;

  beforeAll(async () => {
    session = await createdSession("before-signing");
    seed = { stage: "before-signing", files: { primary: hostileFile() }, session };
    // The same responses the screens will fetch (the mock is deterministic), to know which payloads each screen has to show.
    const [mapResponse, reviewResponse] = await Promise.all([
      domFetch(`${api.baseUrl}/sessions/${session.id}/document-map`, { method: "POST", headers: readerHeaders() }),
      domFetch(`${api.baseUrl}/sessions/${session.id}/review-prompts`, { method: "POST", headers: readerHeaders() }),
    ]);
    map = PrepareDocumentMapResponse.parse(await mapResponse.json()) as DocumentMapResponse;
    review = PrepareReviewPromptsResponse.parse(await reviewResponse.json()) as ReviewPromptsResponse;
  });

  it("shows the document map with every payload as text and none as markup, sources opened", async () => {
    const page = await mount("/map", seed);
    expect(page.at()).toBe("/map");
    await page.until("the map", () => page.byTestId("text-document-summary") !== null || page.byTestId("text-analysis-error") !== null);
    expect(page.byTestId("text-analysis-error")).toBeNull();

    expectIntact(page);
    const opened = await clickAll(page, "button-toggle-source");
    expect(opened).toBeGreaterThan(0);
    expectIntact(page);

    // The mock restates each excerpt's opening words, so the clause-opening script tags are in the claims, the quotes and the opened sources.
    const claims = [...map.map.fields.flatMap((field) => field.claims), ...map.timeline.items.map((item) => item.claim)];
    const cited = new Set(claims.flatMap((claim) => claim.source_chunk_ids));
    const carried = payloadsCarried([
      ...claims.flatMap((claim) => [claim.text, claim.quote]),
      ...map.chunks.filter((chunk) => cited.has(chunk.id)).map((chunk) => chunk.text),
    ]);
    expect(carried).toContain(XSS_PAYLOADS[0]);
    expectCarriedShown(page, carried, 3);
    // The file's hostile name is on the screen as text.
    expect(page.container.textContent).toContain(HOSTILE_FILE_NAME);
  });

  it("shows the review prompts, places and paragraphs included, the same way", async () => {
    const page = await mount("/review", seed);
    await page.until("the review prompts", () => page.all("card-review-prompt-").length > 0 || page.byTestId("text-review-empty") !== null || page.byTestId("text-analysis-error") !== null);
    expect(page.byTestId("text-analysis-error")).toBeNull();
    expect(page.all("card-review-prompt-").length).toBeGreaterThan(0);

    expectIntact(page);
    await clickAll(page, "button-toggle-source");
    await clickAll(page, "button-toggle-places");
    await clickAll(page, "button-toggle-paragraph-");
    expectIntact(page);
    expect(page.all("text-place-paragraph-").length).toBeGreaterThan(0);
    // Prompts with their sources opened, every place's sentence and its paragraph.
    const claims = review.prompts.flatMap((prompt) => [prompt.prompt, ...prompt.places]);
    const cited = new Set(claims.flatMap((claim) => claim.source_chunk_ids));
    const carried = payloadsCarried([
      ...claims.flatMap((claim) => [claim.text, claim.quote]),
      ...review.chunks.filter((chunk) => cited.has(chunk.id)).map((chunk) => chunk.text),
    ]);
    expectCarriedShown(page, carried, 3);
  });

  it("renders the packet as text and downloads it as a plain-text file named after the hostile file, escaped", async () => {
    const page = await mount("/packet", seed);
    await page.until("the packet", () => page.byTestId("packet-document") !== null || page.byTestId("text-analysis-error") !== null);
    expect(page.byTestId("packet-document")).not.toBeNull();
    expectIntact(page);
    const packet = buildPacket({ stage: "before-signing", fileName: HOSTILE_FILE_NAME, map, review, preparedAt: new Date() });
    expectCarriedShown(page, payloadsCarried([renderPacketText(packet)]), 2);

    const blobs: Blob[] = [];
    const anchors: { href: string; download: string }[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return "blob:clausecompass-test";
    });
    const revokeObjectURL = vi.fn();
    const nativeObjectUrls = { createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL };
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const nativeClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function recordedClick(this: HTMLAnchorElement) {
      anchors.push({ href: this.getAttribute("href") ?? "", download: this.getAttribute("download") ?? "" });
    };
    try {
      const button = page.byTestId("button-download-packet-text");
      expect(button).not.toBeNull();
      await act(async () => button!.click());
    } finally {
      HTMLAnchorElement.prototype.click = nativeClick;
      Object.assign(URL, nativeObjectUrls);
    }
    expect(blobs).toHaveLength(1);
    expect(blobs[0]!.type).toMatch(/^text\/plain\b/);
    expect(anchors).toEqual([{ href: "blob:clausecompass-test", download: `clausecompass-packet-<img src=x onerror="window.__xss='name'">.txt` }]);
    const text = await blobs[0]!.text();
    expect(text).toContain(XSS_PAYLOADS[0]);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:clausecompass-test");
    // The anchor was a one-off: nothing hostile is left in the document.
    expect(document.querySelectorAll("a[download]").length).toBe(0);
  });
});

describe("the hostile document in a version comparison", () => {
  it("shows the changed clause on both sides as text", async () => {
    const session = await createdSession("compare-versions", { fileName: HOSTILE_FILE_NAME, bytes: newerVersion });
    const files = {
      older: hostileFile(),
      newer: new File([new Uint8Array(newerVersion)], HOSTILE_FILE_NAME, { type: "text/plain" }),
    };
    const page = await mount("/compare", { stage: "compare-versions", files, session });
    await page.until("the comparison", () => page.byTestId("section-changes") !== null || page.byTestId("text-compare-empty") !== null || page.byTestId("text-analysis-error") !== null);
    expect(page.byTestId("text-analysis-error")).toBeNull();
    expect(page.all("card-change-").length).toBeGreaterThan(0);
    expectIntact(page);
    // The deposit clause opens with the script tag; both versions of it are on the screen as text.
    expect(page.container.textContent).toContain("Rs. 66,000/-");
    expect(page.container.textContent).toContain("Rs. 88,000/-");
    expect(payloadsShown(page.container)).toContain(XSS_PAYLOADS[0]);
  });
});

describe("the hostile file name on the upload screen", () => {
  it("is shown as text next to the chosen file", async () => {
    const session = await createdSession("before-signing");
    const page = await mount("/upload", { stage: "before-signing", files: { primary: hostileFile() }, session });
    expect(page.at()).toBe("/upload");
    expect(page.container.textContent).toContain(HOSTILE_FILE_NAME);
    // The screen's own three pictures, and the footer's leaf, are the only images; the name's <img> would point at "x"
    // and sit in the file card.
    expectIntact(page, ["form", "input"], [...FOOTER_IMAGES, leafAsset, folderAsset, papersAsset]);
  });
});

describe("the packet export off the same responses", () => {
  it("has no live markup in the print view and carries every payload as text in both formats", async () => {
    const session = await createdSession("before-signing");
    const [mapResponse, reviewResponse] = await Promise.all([
      domFetch(`${api.baseUrl}/sessions/${session.id}/document-map`, { method: "POST", headers: readerHeaders() }),
      domFetch(`${api.baseUrl}/sessions/${session.id}/review-prompts`, { method: "POST", headers: readerHeaders() }),
    ]);
    const map = PrepareDocumentMapResponse.parse(await mapResponse.json()) as DocumentMapResponse;
    const review = PrepareReviewPromptsResponse.parse(await reviewResponse.json()) as ReviewPromptsResponse;
    const packet = buildPacket({ stage: "before-signing", fileName: HOSTILE_FILE_NAME, map, review, preparedAt: new Date(Date.UTC(2026, 8, 15, 9)) });
    const html = renderToStaticMarkup(createElement(PacketDocument, { packet }));
    expect(markupSignaturesIn(html)).toEqual([]);
    expect(html).not.toContain(HOSTILE_FILE_NAME);
    expect(html).toContain("&lt;img src=x onerror=&quot;window.__xss=&#x27;name&#x27;&quot;&gt;.txt");
    const text = renderPacketText(packet);
    expect(text).toContain(HOSTILE_FILE_NAME);
    expect(text).toContain(XSS_PAYLOADS[0]);
  });
});
