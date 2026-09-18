import { AskDocumentResponse, GetSessionResponse, PrepareComparisonResponse, PrepareDocumentMapResponse, PrepareReviewPromptsResponse } from "@workspace/api-zod";
import { describe, expect, it, vi } from "vitest";
import { OTHER_READER, READER, UNKNOWN_ID, asReader, baseUrl, call, expectJsonError, llmControl, nda, openSession, pairUpload, rental, rentalUpload, rentalV2 } from "./sessions.helpers";
import type { Result } from "./sessions.helpers";

const llm = llmControl();

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

