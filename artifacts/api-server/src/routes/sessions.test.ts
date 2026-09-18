import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  AskDocumentResponse,
  CreateSessionResponse,
  GetRetentionPolicyResponse,
  GetSessionResponse,
  PrepareComparisonResponse,
  PrepareDocumentMapResponse,
  PrepareReviewPromptsResponse,
} from "@workspace/api-zod";
import type { LlmProvider } from "../llm";
import { loadFixtures } from "../testing/fixtures";

/**
 * The session resource over HTTP with the mock provider (FR-12): the upload
 * opens a session, the outputs come back in the OpenAPI shapes and are
 * prepared once, delete ends everything (the acceptance test: delete, then
 * fetch → 404), expiry does the same on its own, and refusals are JSON
 * errors with nothing from the document or the prompt in them.
 */

/** The provider under the routes: the real mock, counted, and holdable so a run can be caught in flight. */
const llm = vi.hoisted(() => ({
  calls: 0,
  gate: null as Promise<void> | null,
  release: () => {},
  hold() {
    this.gate = new Promise<void>((resolve) => {
      this.release = () => {
        resolve();
        this.gate = null;
      };
    });
  },
}));

vi.mock("../llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../llm")>();
  const inner = actual.createLlmProvider({ provider: "mock", model: "mock", apiKey: undefined, baseUrl: undefined } as never);
  const provider: LlmProvider = {
    name: "mock",
    async complete(request, signal) {
      llm.calls += 1;
      if (llm.gate) await llm.gate;
      return inner.complete(request, signal);
    },
  };
  return { ...actual, getLlmProvider: () => provider };
});

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.PORT = "1";
  process.env.LLM_PROVIDER = "mock";
  process.env.AUTH_PROVIDER = "mock";
  process.env.LOG_LEVEL = "silent";
  process.env.SESSION_TTL_MINUTES = "30";
  process.env.RATE_LIMIT_PER_MINUTE = "0";
  process.env.RATE_LIMIT_HEAVY_PER_MINUTE = "0";
  const { default: app } = await import("../app");
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

afterEach(() => {
  vi.useRealTimers();
  llm.release();
});

interface Upload {
  file?: { bytes: Uint8Array; name: string };
  older?: { bytes: Uint8Array; name: string };
  newer?: { bytes: Uint8Array; name: string };
  /** An extra part the route does not expect. */
  extra?: { field: string; bytes: Uint8Array; name: string };
  stage?: string;
  documentType?: string;
}

interface Result {
  response: Response;
  text: string;
  json: () => Record<string, unknown>;
}

/** The reader every request signs in as unless a test says otherwise (AUTH_PROVIDER=mock accepts `mock:<uid>`). */
const READER = "reader-one";
const OTHER_READER = "reader-two";

const asReader = (uid: string): Record<string, string> => ({ authorization: `Bearer mock:${uid}` });

async function call(method: string, path: string, body?: FormData, headers: Record<string, string> | null = asReader(READER)): Promise<Result> {
  const response = await fetch(`${baseUrl}${path}`, { method, body, headers: headers ?? undefined });
  const text = await response.text();
  return { response, text, json: () => JSON.parse(text) as Record<string, unknown> };
}

async function createSession(upload: Upload): Promise<Result> {
  const body = new FormData();
  for (const field of ["file", "older", "newer"] as const) {
    const part = upload[field];
    if (part) body.append(field, new Blob([new Uint8Array(part.bytes)]), part.name);
  }
  if (upload.extra) body.append(upload.extra.field, new Blob([new Uint8Array(upload.extra.bytes)]), upload.extra.name);
  if (upload.stage !== undefined) body.append("stage", upload.stage);
  if (upload.documentType !== undefined) body.append("documentType", upload.documentType);
  return call("POST", "/sessions", body);
}

/** Opens a session and returns its id, failing loudly if the upload was refused. */
async function openSession(upload: Upload): Promise<string> {
  const result = await createSession(upload);
  expect(result.response.status, result.text).toBe(201);
  return CreateSessionResponse.parse(result.json()).id;
}

const STACK_MARKERS = /\n\s+at\s|node_modules|<pre>|Error:\s|\.ts:\d+|\.mjs:\d+/;

function expectJsonError(result: Result, status: number, code: string) {
  expect(result.response.status).toBe(status);
  expect(result.response.headers.get("content-type")).toMatch(/^application\/json/);
  expect(result.text).not.toMatch(STACK_MARKERS);
  const body = result.json() as { error: { code: string; message: string } };
  expect(Object.keys(body)).toEqual(["error"]);
  expect(body.error.code).toBe(code);
  expect(body.error.message.length).toBeGreaterThan(20);
}

const fixtures = loadFixtures();
const rental = fixtures.find((fixture) => fixture.id === "rental-agreement")!;
const rentalV2 = fixtures.find((fixture) => fixture.id === "rental-agreement-v2")!;
const nda = fixtures.find((fixture) => fixture.id === "nda")!;

const rentalUpload: Upload = { file: { bytes: rental.bytes, name: "rental.txt" }, stage: "before-signing" };
const pairUpload: Upload = {
  older: { bytes: rental.bytes, name: "v1.txt" },
  newer: { bytes: rentalV2.bytes, name: "v2.txt" },
  stage: "compare-versions",
};

const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

describe("who may open a session", () => {
  it("refuses a request with no sign-in token, before reading any document", async () => {
    const body = new FormData();
    body.append("file", new Blob([new Uint8Array(rental.bytes)]), "lease.txt");
    body.append("stage", "before-signing");
    const result = await call("POST", "/sessions", body, null);
    expectJsonError(result, 401, "auth-required");
    expect(result.response.headers.get("www-authenticate")).toBe("Bearer");
  });

  it("refuses a token it does not accept, without saying why", async () => {
    for (const authorization of ["Bearer nonsense", "Bearer mock:", "Bearer mock:not-a-uid!", "Basic abc", "mock:reader-one"]) {
      const result = await call("GET", "/sessions/00000000-0000-4000-8000-000000000000", undefined, { authorization });
      expect(result.response.status, authorization).toBe(401);
      expect(result.json().error).toMatchObject({ code: authorization.startsWith("Bearer ") ? "auth-invalid" : "auth-required" });
      expect(result.text).not.toMatch(/mock|uid|prefix/i);
    }
  });

  it("leaves the retention policy and the health check open", async () => {
    expect((await call("GET", "/sessions/policy", undefined, null)).response.status).toBe(200);
    expect((await call("GET", "/healthz", undefined, null)).response.status).toBe(200);
  });

  it("shows, prepares and ends a session only for the reader who opened it; anyone else gets the 404 of an unknown id", async () => {
    const id = await openSession(rentalUpload);
    const other = asReader(OTHER_READER);
    expectJsonError(await call("GET", `/sessions/${id}`, undefined, other), 404, "session-not-found");
    expectJsonError(await call("POST", `/sessions/${id}/document-map`, undefined, other), 404, "session-not-found");
    expectJsonError(await call("POST", `/sessions/${id}/review-prompts`, undefined, other), 404, "session-not-found");
    expectJsonError(await call("POST", `/sessions/${id}/compare`, undefined, other), 404, "session-not-found");
    // The other reader's delete answers 204 like any unknown id, and deletes nothing.
    expect((await call("DELETE", `/sessions/${id}`, undefined, other)).response.status).toBe(204);
    expect((await call("GET", `/sessions/${id}`)).response.status).toBe(200);
    // The owner's delete ends it.
    expect((await call("DELETE", `/sessions/${id}`)).response.status).toBe(204);
    expectJsonError(await call("GET", `/sessions/${id}`), 404, "session-not-found");
  });

  it("does not let another reader's refused requests move the retention clock", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // Two sessions opened together; ten minutes on, one is touched by its owner, the other only by a stranger.
    const touchedByOwner = await openSession(rentalUpload);
    const touchedByStranger = await openSession(rentalUpload);
    const other = asReader(OTHER_READER);

    vi.setSystemTime(Date.now() + 10 * 60_000);
    expect((await call("GET", `/sessions/${touchedByOwner}`)).response.status).toBe(200);
    expect((await call("GET", `/sessions/${touchedByStranger}`, undefined, other)).response.status).toBe(404);
    expect((await call("POST", `/sessions/${touchedByStranger}/document-map`, undefined, other)).response.status).toBe(404);
    expect((await call("POST", `/sessions/${touchedByStranger}/review-prompts`, undefined, other)).response.status).toBe(404);
    expect((await call("POST", `/sessions/${touchedByStranger}/compare`, undefined, other)).response.status).toBe(404);
    expect((await call("DELETE", `/sessions/${touchedByStranger}`, undefined, other)).response.status).toBe(204);

    // Past the original window: the owner's touch kept the one session, the stranger's requests kept nothing.
    vi.setSystemTime(Date.now() + 21 * 60_000);
    expect((await call("GET", `/sessions/${touchedByOwner}`)).response.status).toBe(200);
    expectJsonError(await call("GET", `/sessions/${touchedByStranger}`), 404, "session-not-found");
  });
});

describe("GET /api/sessions/policy", () => {
  it("states the retention rule the server enforces", async () => {
    const result = await call("GET", "/sessions/policy");
    expect(result.response.status).toBe(200);
    expect(GetRetentionPolicyResponse.parse(result.json())).toEqual({ ttlMinutes: 30 });
  });
});

describe("POST /api/sessions", () => {
  it("opens a session for one document: summary, slot, expiry, no outputs yet", async () => {
    const before = Date.now();
    const result = await createSession(rentalUpload);
    expect(result.response.status).toBe(201);
    const body = CreateSessionResponse.parse(result.json());

    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.stage).toBe("before-signing");
    expect(body.documentType).toBeUndefined();
    expect(body.ttlMinutes).toBe(30);
    expect(body.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 30 * 60_000 - 1000);
    expect(body.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 30 * 60_000 + 1000);
    expect(body.documents).toEqual([
      {
        slot: "primary",
        name: "rental.txt",
        document: { kind: "txt", pageCount: null, wordCount: rental.golden.wordCount, paragraphCount: rental.golden.paragraphCount },
      },
    ]);
    expect(body.outputs).toEqual({ documentMap: false, reviewPrompts: false, compare: false });
    // The paragraphs themselves are not in the session view.
    expect(result.text).not.toMatch(/Landlord|Tenant|Rupees/i);
  });

  it("opens a session for two versions, keeping which is which", async () => {
    const result = await createSession(pairUpload);
    expect(result.response.status).toBe(201);
    const body = CreateSessionResponse.parse(result.json());
    expect(body.stage).toBe("compare-versions");
    expect(body.documents.map((held) => [held.slot, held.name, held.document.paragraphCount])).toEqual([
      ["older", "v1.txt", rental.golden.paragraphCount],
      ["newer", "v2.txt", rentalV2.golden.paragraphCount],
    ]);
  });

  it("accepts an optional document type", async () => {
    const result = await createSession({ file: { bytes: nda.bytes, name: "nda.txt" }, stage: "problem-started", documentType: "nda" });
    expect(result.response.status).toBe(201);
    expect(CreateSessionResponse.parse(result.json()).documentType).toBe("nda");
  });

  it("keeps a plain file name: whitespace collapsed, capped with the extension kept", async () => {
    const long = "x".repeat(200);
    const result = await createSession({ file: { bytes: rental.bytes, name: `  my   lease ${long}.txt` }, stage: "before-signing" });
    expect(result.response.status).toBe(201);
    const [held] = CreateSessionResponse.parse(result.json()).documents;
    expect(held!.name.startsWith("my lease " + "x".repeat(20))).toBe(true);
    expect(held!.name.length).toBeLessThanOrEqual(120);
    expect(held!.name.endsWith(".txt")).toBe(true);
  });

  it("refuses a file name that is a path instead of quietly trimming it", async () => {
    const result = await createSession({ file: { bytes: rental.bytes, name: "C:\\Users\\me\\Desktop\\lease.txt" }, stage: "before-signing" });
    expectJsonError(result, 400, "bad-filename");
  });

  it("refuses a multipart body it cannot parse as a bad upload, not a crash", async () => {
    const boundary = "----clausecompass";
    const raw = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a\u0007b.txt"\r\n\r\nhello\r\n--${boundary}--\r\n`;
    const response = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { ...asReader(READER), "content-type": `multipart/form-data; boundary=${boundary}` },
      body: raw,
    });
    const text = await response.text();
    expectJsonError({ response, text, json: () => JSON.parse(text) as Record<string, unknown> }, 400, "bad-upload");
  });

  it("gives every session its own unguessable id", async () => {
    const ids = await Promise.all([openSession(rentalUpload), openSession(rentalUpload), openSession(rentalUpload)]);
    expect(new Set(ids).size).toBe(3);
  });

  it("refuses an unknown or missing stage before reading any document", async () => {
    expectJsonError(await createSession({ file: rentalUpload.file }), 400, "bad-stage");
    expectJsonError(await createSession({ file: rentalUpload.file, stage: "later" }), 400, "bad-stage");
  });

  it("refuses an unknown document type", async () => {
    expectJsonError(await createSession({ ...rentalUpload, documentType: "will" }), 400, "bad-document-type");
  });

  it("refuses an upload missing the file(s) the stage needs", async () => {
    expectJsonError(await createSession({ stage: "before-signing" }), 400, "no-file");
    expectJsonError(await createSession({ stage: "compare-versions", older: pairUpload.older }), 400, "no-file");
    expectJsonError(await createSession({ stage: "compare-versions", newer: pairUpload.newer }), 400, "no-file");
    expectJsonError(await createSession({ stage: "compare-versions" }), 400, "no-file");
  });

  it("refuses a file in a field the stage does not use", async () => {
    expectJsonError(await createSession({ ...rentalUpload, older: pairUpload.older }), 400, "bad-upload");
    expectJsonError(await createSession({ ...pairUpload, file: rentalUpload.file }), 400, "bad-upload");
    expectJsonError(await createSession({ ...pairUpload, extra: { field: "third", bytes: rental.bytes, name: "v3.txt" } }), 400, "bad-upload");
  });

  it("refuses an unreadable document the way /documents/extract does", async () => {
    const result = await createSession({ file: { bytes: new Uint8Array([0, 1, 2, 3]), name: "scan.png" }, stage: "before-signing" });
    expectJsonError(result, 415, "unsupported-format");
    expect((result.json() as { error: { message: string } }).error.message).not.toMatch(/version/);
  });

  it("names the version when one of two is unreadable", async () => {
    const result = await createSession({ ...pairUpload, newer: { bytes: new Uint8Array([0, 1, 2, 3]), name: "scan.png" } });
    expectJsonError(result, 415, "unsupported-format");
    expect((result.json() as { error: { message: string } }).error.message).toMatch(/^The newer version: /);
  });
});

describe("GET /api/sessions/:id", () => {
  it("returns the session and extends its expiry", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const id = await openSession(rentalUpload);
    const opened = CreateSessionResponse.parse((await call("GET", `/sessions/${id}`)).json()).expiresAt.getTime();

    vi.setSystemTime(Date.now() + 20 * 60_000);
    const result = await call("GET", `/sessions/${id}`);
    expect(result.response.status).toBe(200);
    const body = GetSessionResponse.parse(result.json());
    expect(body.id).toBe(id);
    expect(body.expiresAt.getTime()).toBe(opened + 20 * 60_000);
  });

  it("is 404 for an id that was never issued, or that is not an id at all", async () => {
    expectJsonError(await call("GET", `/sessions/${UNKNOWN_ID}`), 404, "session-not-found");
    expectJsonError(await call("GET", "/sessions/not-an-id"), 404, "session-not-found");
  });
});

describe("outputs prepared inside a session", () => {
  it("prepares the document map and timeline in the OpenAPI shape, once per session", async () => {
    const id = await openSession(rentalUpload);
    const callsBefore = llm.calls;
    const result = await call("POST", `/sessions/${id}/document-map`);
    expect(result.response.status).toBe(200);
    const body = PrepareDocumentMapResponse.parse(result.json());

    expect(body.document).toEqual({ kind: "txt", pageCount: null, wordCount: rental.golden.wordCount, paragraphCount: rental.golden.paragraphCount });
    expect(body.chunks).toHaveLength(rental.golden.paragraphCount);
    expect(body.map.fields.map((field) => field.id)).toEqual(["parties", "dates", "money", "duties", "termination", "dispute"]);
    expect(body.map.fields.every((field) => field.status === "found")).toBe(true);
    expect(body.timeline.items.map((item) => item.date)).toEqual(["2026-02-24", "2026-03-01", "2026-03-01", "2026-08-31", "2027-01-31"]);

    // Every citation resolves to a returned chunk, and every quote is in it.
    const byId = new Map(body.chunks.map((chunk) => [chunk.id, chunk]));
    const claims = [...body.map.fields.flatMap((field) => field.claims), ...body.timeline.items.map((item) => item.claim)];
    expect(claims.length).toBeGreaterThan(10);
    for (const claim of claims) {
      const cited = claim.source_chunk_ids.map((chunkId) => byId.get(chunkId));
      expect(cited.every(Boolean)).toBe(true);
      expect(cited.some((chunk) => chunk!.text.includes(claim.quote))).toBe(true);
    }
    // Nothing from the prompt leaks into the response.
    expect(result.text).not.toMatch(/excerpt|JSON|source_chunk_ids":\s*\[\]|Rules:/i);

    // The second request is a lookup: same body, no further model call, and the session says it holds the map.
    const callsAfterFirst = llm.calls;
    expect(callsAfterFirst).toBeGreaterThan(callsBefore);
    const again = await call("POST", `/sessions/${id}/document-map`);
    expect(again.response.status).toBe(200);
    expect(again.text).toBe(result.text);
    expect(llm.calls).toBe(callsAfterFirst);
    expect(GetSessionResponse.parse((await call("GET", `/sessions/${id}`)).json()).outputs).toEqual({ documentMap: true, reviewPrompts: false, compare: false });
  });

  it("prepares the review prompts in the OpenAPI shape, grouped by relevance, every claim traceable to a returned chunk", async () => {
    const id = await openSession(rentalUpload);
    const result = await call("POST", `/sessions/${id}/review-prompts`);
    expect(result.response.status).toBe(200);
    const body = PrepareReviewPromptsResponse.parse(result.json());

    expect(body.document).toEqual({ kind: "txt", pageCount: null, wordCount: rental.golden.wordCount, paragraphCount: rental.golden.paragraphCount });
    expect(body.chunks).toHaveLength(rental.golden.paragraphCount);
    expect(body.stage).toBe("before-signing");
    expect(body.registryVersion.length).toBeGreaterThan(0);
    expect(body.prompts.length).toBeGreaterThan(10);
    expect(body.notFound.length).toBeGreaterThan(0);

    const order = { primary: 0, secondary: 1, background: 2 };
    const ranks = body.prompts.map((prompt) => order[prompt.relevance]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(body.prompts.map((prompt) => prompt.ruleId)).size).toBe(body.prompts.length);

    const byId = new Map(body.chunks.map((chunk) => [chunk.id, chunk]));
    for (const prompt of body.prompts) {
      expect(prompt.places.length).toBeGreaterThan(0);
      expect(prompt.phrasedBy === "template" ? prompt.reason !== null : prompt.reason === null).toBe(true);
      for (const claim of [prompt.prompt, ...prompt.places]) {
        expect(claim.category).toBe(prompt.category);
        const cited = claim.source_chunk_ids.map((chunkId) => byId.get(chunkId));
        expect(cited.every(Boolean)).toBe(true);
        expect(cited.some((chunk) => chunk!.text.includes(claim.quote))).toBe(true);
      }
    }
    expect(result.text).not.toMatch(/excerpt|JSON|source_chunk_ids":\s*\[\]|Rules:/i);

    const calls = llm.calls;
    expect((await call("POST", `/sessions/${id}/review-prompts`)).text).toBe(result.text);
    expect(llm.calls).toBe(calls);
  });

  it("scopes the review prompts to the session's document type and stage", async () => {
    const id = await openSession({ file: { bytes: nda.bytes, name: "nda.txt" }, stage: "problem-started", documentType: "nda" });
    const body = PrepareReviewPromptsResponse.parse((await call("POST", `/sessions/${id}/review-prompts`)).json());
    expect(body.stage).toBe("problem-started");
    const missing = body.notFound.map((absent) => absent.ruleId);
    expect(missing).not.toContain("duty.upkeep"); // a rental-only rule is not reported missing from an NDA
    expect(missing).toContain("exit.lock-in");
  });

  it("prepares the change cards for a comparison in the OpenAPI shape, each side traceable to its returned chunks", async () => {
    const id = await openSession(pairUpload);
    const result = await call("POST", `/sessions/${id}/compare`);
    expect(result.response.status).toBe(200);
    const body = PrepareComparisonResponse.parse(result.json());

    expect(body.older.document).toEqual({ kind: "txt", pageCount: null, wordCount: rental.golden.wordCount, paragraphCount: rental.golden.paragraphCount });
    expect(body.newer.document).toEqual({ kind: "txt", pageCount: null, wordCount: rentalV2.golden.wordCount, paragraphCount: rentalV2.golden.paragraphCount });
    expect(body.older.chunks).toHaveLength(rental.golden.paragraphCount);
    expect(body.newer.chunks).toHaveLength(rentalV2.golden.paragraphCount);

    // The acceptance line of the compare task: the late fee and the notice period, each with both excerpts.
    const lateFee = body.changes.find((change) => change.older?.location.clause === "2.2")!;
    const notice = body.changes.find((change) => change.older?.location.clause === "4.2")!;
    expect(lateFee).toMatchObject({ status: "changed", kind: "money", values: { older: ["Rs. 200/-", "Rupees Two Hundred only"], newer: ["Rs. 500/-", "Rupees Five Hundred only"] } });
    expect(notice).toMatchObject({ status: "changed", kind: "time", values: { older: ["one (1) month's", "one month's"], newer: ["two (2) months'", "two months'"] } });

    const olderById = new Map(body.older.chunks.map((chunk) => [chunk.id, chunk]));
    const newerById = new Map(body.newer.chunks.map((chunk) => [chunk.id, chunk]));
    for (const change of body.changes) {
      if (change.older) {
        expect(change.older.segments.map((segment) => segment.text).join("")).toBe(olderById.get(change.older.chunkId)!.text);
        expect(change.older.location).toEqual(olderById.get(change.older.chunkId)!.location);
      }
      if (change.newer) {
        expect(change.newer.segments.map((segment) => segment.text).join("")).toBe(newerById.get(change.newer.chunkId)!.text);
        expect(change.newer.location).toEqual(newerById.get(change.newer.chunkId)!.location);
      }
    }
    expect(body.changes.map((change) => [change.status, change.kind])).toEqual([
      ["changed", "wording"],
      ["changed", "money"],
      ["removed", "money"],
      ["changed", "time"],
      ["changed", "remedy"],
      ["changed", "duty"],
      ["added", "duty"],
    ]);
    expect(body.unchanged + body.changes.filter((change) => change.status === "changed").length).toBe(body.aligned);
    expect(body.byKind).toEqual({ money: 2, time: 1, duty: 2, remedy: 1, wording: 1 });

    expect((await call("POST", `/sessions/${id}/compare`)).text).toBe(result.text);
    expect(GetSessionResponse.parse((await call("GET", `/sessions/${id}`)).json()).outputs.compare).toBe(true);
  });

  it("describes the newer version when a comparison session asks for the map or the prompts", async () => {
    const id = await openSession(pairUpload);
    const map = PrepareDocumentMapResponse.parse((await call("POST", `/sessions/${id}/document-map`)).json());
    expect(map.document.paragraphCount).toBe(rentalV2.golden.paragraphCount);
    const review = PrepareReviewPromptsResponse.parse((await call("POST", `/sessions/${id}/review-prompts`)).json());
    expect(review.document.paragraphCount).toBe(rentalV2.golden.paragraphCount);
    expect(review.stage).toBe("compare-versions");
  });

  it("finds nothing to report between a document and itself", async () => {
    const id = await openSession({ ...pairUpload, newer: { bytes: rental.bytes, name: "b.txt" } });
    const body = PrepareComparisonResponse.parse((await call("POST", `/sessions/${id}/compare`)).json());
    expect(body.changes).toEqual([]);
    expect(body.unchanged).toBe(rental.golden.paragraphCount);
  });

  it("refuses change cards for a session with one document", async () => {
    const id = await openSession(rentalUpload);
    expectJsonError(await call("POST", `/sessions/${id}/compare`), 400, "not-a-comparison");
  });

  it("refuses two versions with more paragraph pairs than the alignment table allows, with 422, and keeps nothing for it", async () => {
    // 2,100 one-word paragraphs a side: under the word cap, over the 2,000 × 2,000 pair cap.
    const bytes = new TextEncoder().encode(Array.from({ length: 2100 }, (_, i) => `Clause ${i}`).join("\n\n"));
    const id = await openSession({ stage: "compare-versions", older: { bytes, name: "long-v1.txt" }, newer: { bytes, name: "long-v2.txt" } });
    const result = await call("POST", `/sessions/${id}/compare`);
    expectJsonError(result, 422, "too-complex");
    expect((result.json() as { error: { message: string } }).error.message).toMatch(/too many paragraphs/);
    expect(GetSessionResponse.parse((await call("GET", `/sessions/${id}`)).json()).outputs.compare).toBe(false);
  });

  it("shares one run between concurrent requests for the same output", async () => {
    // How many model calls one run of the map takes.
    const solo = await openSession(rentalUpload);
    const beforeSolo = llm.calls;
    expect((await call("POST", `/sessions/${solo}/document-map`)).response.status).toBe(200);
    const callsPerRun = llm.calls - beforeSolo;
    expect(callsPerRun).toBeGreaterThan(0);

    const id = await openSession(rentalUpload);
    const before = llm.calls;
    llm.hold();
    const requests = [call("POST", `/sessions/${id}/document-map`), call("POST", `/sessions/${id}/document-map`), call("POST", `/sessions/${id}/document-map`)];
    await vi.waitFor(() => expect(llm.calls).toBeGreaterThan(before));
    llm.release();
    const results = await Promise.all(requests);
    expect(results.map((result) => result.response.status)).toEqual([200, 200, 200]);
    expect(new Set(results.map((result) => result.text)).size).toBe(1);
    // One run's worth of model calls for three requests, not three runs' worth.
    expect(llm.calls - before).toBe(callsPerRun);
  });

  it("answers 503 busy with Retry-After once the process has as many analyses running and waiting as it allows", async () => {
    const { analysisGate, MAX_CONCURRENT_ANALYSES, MAX_WAITING_ANALYSES } = await import("../middlewares/budgets");
    const id = await openSession(rentalUpload);
    // Fill every slot and every place in the queue by hand, as that many concurrent readers would.
    const admissions = Array.from({ length: MAX_CONCURRENT_ANALYSES + MAX_WAITING_ANALYSES }, () => analysisGate.acquire()!);
    const releases = await Promise.all(admissions.slice(0, MAX_CONCURRENT_ANALYSES));
    try {
      const refused = await call("POST", `/sessions/${id}/document-map`);
      expectJsonError(refused, 503, "busy");
      expect(refused.response.headers.get("retry-after")).toBe("5");
      expect(analysisGate.stats).toEqual({ active: MAX_CONCURRENT_ANALYSES, waiting: MAX_WAITING_ANALYSES });
    } finally {
      for (const release of releases) release();
      // Waiters are admitted in arrival order as places free up, so each is awaited and released in turn.
      for (const admission of admissions.slice(MAX_CONCURRENT_ANALYSES)) (await admission)();
    }
    expect(analysisGate.stats).toEqual({ active: 0, waiting: 0 });
    expect((await call("POST", `/sessions/${id}/document-map`)).response.status).toBe(200);
  });

  it("is 404 for an output of a session that does not exist", async () => {
    expectJsonError(await call("POST", `/sessions/${UNKNOWN_ID}/document-map`), 404, "session-not-found");
    expectJsonError(await call("POST", `/sessions/${UNKNOWN_ID}/review-prompts`), 404, "session-not-found");
    expectJsonError(await call("POST", `/sessions/${UNKNOWN_ID}/compare`), 404, "session-not-found");
    expectJsonError(await ask(UNKNOWN_ID, { question: "what is the notice period" }), 404, "session-not-found");
  });
});

/** One question over the JSON body, as the browser sends it. */
async function ask(sessionId: string, body: unknown, headers: Record<string, string> | null = asReader(READER)): Promise<Result> {
  const response = await fetch(`${baseUrl}/sessions/${sessionId}/ask`, {
    method: "POST",
    headers: { ...(headers ?? {}), "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await response.text();
  return { response, text, json: () => JSON.parse(text) as Record<string, unknown> };
}

describe("POST /api/sessions/:id/ask", () => {
  it("answers a question from the document in the OpenAPI shape: every statement quotes a passage that was returned, and asking again runs again", async () => {
    const id = await openSession(rentalUpload);
    const calls = llm.calls;
    const result = await ask(id, { question: "what is the notice period" });
    expect(result.response.status, result.text).toBe(200);
    const body = AskDocumentResponse.parse(result.json());

    expect(body.document).toEqual({ kind: "txt", pageCount: null, wordCount: rental.golden.wordCount, paragraphCount: rental.golden.paragraphCount });
    expect(body.status).toBe("answered");
    expect(body.reason).toBeNull();
    expect(body.suggestedQuestion).toBeNull();
    expect(body.style).toBe("full");
    expect(body.passages.length).toBeGreaterThan(0);
    expect(body.passages.length).toBeLessThanOrEqual(5);
    expect(body.passages.some((passage) => passage.location.clause === "4.2")).toBe(true);
    expect(body.claims.length).toBeGreaterThan(0);
    expect(body.claims.length).toBeLessThanOrEqual(3);
    const byId = new Map(body.passages.map((passage) => [passage.id, passage]));
    for (const claim of body.claims) {
      const cited = claim.source_chunk_ids.map((chunkId) => byId.get(chunkId));
      expect(cited.every(Boolean)).toBe(true);
      expect(cited.some((passage) => passage!.text.includes(claim.quote))).toBe(true);
      expect(claim.category).toBe("answer");
    }
    expect(result.text).not.toMatch(/excerpt|JSON|source_chunk_ids":\s*\[\]/i);
    expect(llm.calls).toBe(calls + 1);

    // Not a prepared output: nothing is kept, so the same question is a new call, and the session view shows no new output.
    expect((await ask(id, { question: "what is the notice period" })).response.status).toBe(200);
    expect(llm.calls).toBe(calls + 2);
    const view = GetSessionResponse.parse((await call("GET", `/sessions/${id}`)).json());
    expect(view.outputs).toEqual({ documentMap: false, reviewPrompts: false, compare: false });
  });

  it("says the document does not answer a question it has no words for, without calling the model, and hands the question back", async () => {
    const id = await openSession(rentalUpload);
    const calls = llm.calls;
    const result = await ask(id, { question: "  xylophone   quantum spaceship ", style: "brief" });
    expect(result.response.status, result.text).toBe(200);
    const body = AskDocumentResponse.parse(result.json());
    expect(body).toMatchObject({
      status: "not-in-document",
      reason: "no-evidence",
      suggestedQuestion: "xylophone quantum spaceship?",
      style: "brief",
      claims: [],
      passages: [],
      withheld: 0,
    });
    expect(llm.calls).toBe(calls);
  });

  it("asks for one statement under a close deadline", async () => {
    const id = await openSession(rentalUpload);
    const body = AskDocumentResponse.parse((await ask(id, { question: "deposit kab wapas milega", style: "brief" })).json());
    expect(body.status).toBe("answered");
    expect(body.style).toBe("brief");
    expect(body.claims).toHaveLength(1);
  });

  it("answers about the newer version of a comparison", async () => {
    const id = await openSession(pairUpload);
    const body = AskDocumentResponse.parse((await ask(id, { question: "what is the notice period" })).json());
    expect(body.document.paragraphCount).toBe(rentalV2.golden.paragraphCount);
  });

  it("refuses a missing, empty, over-long or malformed question as a JSON error, before reading the document", async () => {
    const id = await openSession(rentalUpload);
    const calls = llm.calls;
    expectJsonError(await ask(id, {}), 400, "bad-question");
    expectJsonError(await ask(id, { question: "   " }), 400, "bad-question");
    expectJsonError(await ask(id, { question: "notice ".repeat(80) }), 400, "bad-question");
    expectJsonError(await ask(id, { question: 42 }), 400, "bad-question");
    expectJsonError(await ask(id, { question: "notice", style: "long" }), 400, "bad-question");
    expectJsonError(await ask(id, "{not json"), 400, "bad-request");
    expect(llm.calls).toBe(calls);
  });

  it("takes a question of exactly the cap without end punctuation: the question mark the tidying adds is not counted against it", async () => {
    const id = await openSession(rentalUpload);
    const question = `what is the notice period ${"x".repeat(500)}`.slice(0, 500);
    expect(question).toHaveLength(500);
    expect(question.endsWith("?")).toBe(false);
    const result = await ask(id, { question });
    expect(result.response.status, result.text).toBe(200);
    expect(AskDocumentResponse.parse(result.json()).status).toBe("answered");
  });

  it("is the reader's own: another reader gets the 404 of an unknown id, and no token gets 401", async () => {
    const id = await openSession(rentalUpload);
    expectJsonError(await ask(id, { question: "what is the notice period" }, asReader(OTHER_READER)), 404, "session-not-found");
    expectJsonError(await ask(id, { question: "what is the notice period" }, null), 401, "auth-required");
  });

  it("is ended by a delete while the question is in flight: the model call is aborted and the answer is 404, not the document's words", async () => {
    const id = await openSession(rentalUpload);
    llm.hold();
    const calls = llm.calls;
    const inFlight = ask(id, { question: "what is the notice period" });
    await vi.waitFor(() => expect(llm.calls).toBe(calls + 1));
    expect((await call("DELETE", `/sessions/${id}`)).response.status).toBe(204);
    llm.release();
    const result = await inFlight;
    expectJsonError(result, 404, "session-not-found");
    expect(result.text).not.toMatch(/fifteen days|claims":\s*\[\{/);
    const { getInFlight } = await import("../sessions");
    expect(getInFlight().size).toBe(0);
  });
});

describe("DELETE /api/sessions/:id", () => {
  it("deletes the session: the fetch that follows is 404, and so is every output and a repeat delete is still 204", async () => {
    const id = await openSession(rentalUpload);
    PrepareDocumentMapResponse.parse((await call("POST", `/sessions/${id}/document-map`)).json());
    PrepareReviewPromptsResponse.parse((await call("POST", `/sessions/${id}/review-prompts`)).json());
    expect((await call("GET", `/sessions/${id}`)).response.status).toBe(200);

    const deleted = await call("DELETE", `/sessions/${id}`);
    expect(deleted.response.status).toBe(204);
    expect(deleted.text).toBe("");

    expectJsonError(await call("GET", `/sessions/${id}`), 404, "session-not-found");
    expectJsonError(await call("POST", `/sessions/${id}/document-map`), 404, "session-not-found");
    expectJsonError(await call("POST", `/sessions/${id}/review-prompts`), 404, "session-not-found");
    expectJsonError(await call("POST", `/sessions/${id}/compare`), 404, "session-not-found");
    expect((await call("DELETE", `/sessions/${id}`)).response.status).toBe(204);
  });

  it("is 204 for an id that was never issued, or is not an id at all", async () => {
    expect((await call("DELETE", `/sessions/${UNKNOWN_ID}`)).response.status).toBe(204);
    expect((await call("DELETE", "/sessions/not-an-id")).response.status).toBe(204);
  });

  it("removes a comparison's two documents and its cards alike", async () => {
    const id = await openSession(pairUpload);
    PrepareComparisonResponse.parse((await call("POST", `/sessions/${id}/compare`)).json());
    expect((await call("DELETE", `/sessions/${id}`)).response.status).toBe(204);
    expectJsonError(await call("GET", `/sessions/${id}`), 404, "session-not-found");
    expectJsonError(await call("POST", `/sessions/${id}/compare`), 404, "session-not-found");
  });

  it("ends a preparation still in flight: the request answers 404 and the output is not kept anywhere", async () => {
    const id = await openSession(rentalUpload);
    llm.hold();
    const inFlight = call("POST", `/sessions/${id}/document-map`);
    await vi.waitFor(() => expect(llm.calls).toBeGreaterThan(0));
    expect((await call("DELETE", `/sessions/${id}`)).response.status).toBe(204);
    llm.release();
    expectJsonError(await inFlight, 404, "session-not-found");
    expectJsonError(await call("GET", `/sessions/${id}`), 404, "session-not-found");
  });
});

describe("expiry", () => {
  it("deletes a session on its own once the TTL passes without activity, and activity postpones that", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const id = await openSession(rentalUpload);
    PrepareDocumentMapResponse.parse((await call("POST", `/sessions/${id}/document-map`)).json());

    // 29 minutes of silence: still there, and the read starts the clock again.
    vi.setSystemTime(Date.now() + 29 * 60_000);
    expect((await call("GET", `/sessions/${id}`)).response.status).toBe(200);
    vi.setSystemTime(Date.now() + 29 * 60_000);
    expect((await call("POST", `/sessions/${id}/document-map`)).response.status).toBe(200);

    // 30 minutes of silence: gone, outputs included.
    vi.setSystemTime(Date.now() + 30 * 60_000);
    expectJsonError(await call("GET", `/sessions/${id}`), 404, "session-not-found");
    expectJsonError(await call("POST", `/sessions/${id}/document-map`), 404, "session-not-found");
  });
});

describe("what a session holds", () => {
  it("keeps extracted paragraphs, never the uploaded bytes", async () => {
    const id = await openSession(pairUpload);
    const { getSessionStore } = await import("../sessions");
    const found = await getSessionStore().find(id, READER);
    expect(found.outcome).toBe("found");
    if (found.outcome !== "found") return;
    const { session } = found;
    const seen = new Set<unknown>();
    const walk = (value: unknown, path: string) => {
      if (value === null || typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      expect(value instanceof Uint8Array || value instanceof ArrayBuffer, `${path} holds raw bytes`).toBe(false);
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) walk(child, `${path}.${key}`);
    };
    walk(session, "session");
    expect(session.documents.map((held) => held.document.chunks.length)).toEqual([rental.golden.paragraphCount, rentalV2.golden.paragraphCount]);
  });
});
