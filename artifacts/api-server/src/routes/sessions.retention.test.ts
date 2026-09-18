import { PrepareComparisonResponse, PrepareDocumentMapResponse, PrepareReviewPromptsResponse } from "@workspace/api-zod";
import { describe, expect, it, vi } from "vitest";
import { READER, UNKNOWN_ID, call, expectJsonError, llmControl, openSession, pairUpload, rental, rentalUpload, rentalV2 } from "./sessions.helpers";

const llm = llmControl();

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
