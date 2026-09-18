import { CreateSessionResponse, GetRetentionPolicyResponse, GetSessionResponse } from "@workspace/api-zod";
import { describe, expect, it, vi } from "vitest";
import { OTHER_READER, READER, UNKNOWN_ID, asReader, baseUrl, call, createSession, expectJsonError, nda, openSession, pairUpload, rental, rentalUpload, rentalV2 } from "./sessions.helpers";

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

