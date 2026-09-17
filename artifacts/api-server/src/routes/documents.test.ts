import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadFixtures } from "../testing/fixtures";
import { makeEncryptedPdf, makePdf } from "../testing/make-pdf";

/**
 * Drives the real Express app over HTTP: the file goes through multer, the
 * extractor and the JSON error handler exactly as an upload from the client
 * would. The app reads its config at import time, so the environment is set
 * first and the app imported afterwards.
 */

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.PORT = "1";
  process.env.LLM_PROVIDER = "mock";
  process.env.AUTH_PROVIDER = "mock";
  process.env.LOG_LEVEL = "silent";
  // The budgets are per client address and every request here is 127.0.0.1; they have their own tests.
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

/** The signed-in reader every request here is from (AUTH_PROVIDER=mock accepts `mock:<uid>`). */
const READER = { authorization: "Bearer mock:reader-one" };

async function upload(bytes: Uint8Array, filename: string, field = "file") {
  const body = new FormData();
  body.append(field, new Blob([new Uint8Array(bytes)]), filename);
  const response = await fetch(`${baseUrl}/documents/extract`, { method: "POST", headers: READER, body });
  const text = await response.text();
  return { response, text, json: () => JSON.parse(text) as Record<string, unknown> };
}

/** What a leaked Express/V8 error page or stack would contain. */
const STACK_MARKERS = /\n\s+at\s|node_modules|<pre>|Error:\s|\.ts:\d+|\.mjs:\d+/;

function expectJsonError(result: Awaited<ReturnType<typeof upload>>, status: number, code: string) {
  expect(result.response.status).toBe(status);
  expect(result.response.headers.get("content-type")).toMatch(/^application\/json/);
  expect(result.text).not.toMatch(STACK_MARKERS);
  const body = result.json() as { error: { code: string; message: string } };
  expect(Object.keys(body)).toEqual(["error"]);
  expect(body.error.code).toBe(code);
  expect(body.error.message.length).toBeGreaterThan(20);
  return body;
}

describe("POST /api/documents/extract", () => {
  const fixtures = loadFixtures();

  it("returns chunks with page and paragraph metadata for a TXT fixture", async () => {
    const fixture = fixtures[0]!;
    const result = await upload(fixture.bytes, `${fixture.id}.txt`);
    expect(result.response.status).toBe(200);
    const body = result.json() as {
      kind: string;
      pageCount: number | null;
      wordCount: number;
      chunks: { text: string; page: number | null; paragraphIndex: number }[];
    };
    expect(body.kind).toBe("txt");
    expect(body.pageCount).toBeNull();
    expect(body.wordCount).toBe(fixture.golden.wordCount);
    expect(body.chunks).toHaveLength(fixture.golden.paragraphCount);
    expect(Object.keys(body.chunks[0]!).sort()).toEqual(["page", "paragraphIndex", "text"]);
    for (const anchor of fixture.golden.anchors) {
      expect(body.chunks[anchor.paragraphIndex - 1]!.text.startsWith(anchor.startsWith)).toBe(true);
    }
  });

  it("returns page numbers for a generated PDF", async () => {
    const made = makePdf(["First page paragraph, long enough to be counted as readable text.", "Second page paragraph."], {
      linesPerPage: 1,
    });
    const result = await upload(made.bytes, "two-pages.pdf");
    expect(result.response.status).toBe(200);
    const body = result.json() as { pageCount: number; chunks: { page: number; paragraphIndex: number }[] };
    expect(body.pageCount).toBe(2);
    expect(body.chunks.map((chunk) => [chunk.page, chunk.paragraphIndex])).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });

  it("answers a corrupted file with a handled JSON error, not a stack trace", async () => {
    const corrupt = new Uint8Array(Buffer.concat([Buffer.from("%PDF-1.5\n"), Buffer.alloc(4096, 0xff)]));
    const body = expectJsonError(await upload(corrupt, "corrupt.pdf"), 422, "malformed");
    expect(body.error.message).not.toMatch(/xref|InvalidPDF|pdf\.js/i);
  });

  it("maps the other refusals to their status codes", async () => {
    expectJsonError(await upload(makeEncryptedPdf(), "locked.pdf"), 422, "encrypted");
    expectJsonError(await upload(new Uint8Array([1, 2, 3]), "notes.rtf"), 415, "unsupported-format");
    expectJsonError(await upload(new Uint8Array(Buffer.from("plain text")), "renamed.pdf"), 415, "format-mismatch");
    expectJsonError(await upload(new Uint8Array(0), "empty.txt"), 422, "empty");
    expectJsonError(await upload(new Uint8Array(Buffer.from(" \n\t")), "blank.txt"), 422, "no-text");
  });

  it("stops an oversized upload with 413 while it is still streaming in", async () => {
    const oversized = new Uint8Array(10 * 1024 * 1024 + 1).fill(0x61);
    expectJsonError(await upload(oversized, "big.txt"), 413, "too-large");
  });

  it("answers 503 with a Retry-After hint when either gate is full", async () => {
    const { extractionGate, uploadGate } = await import("./documents");
    for (const gate of [uploadGate, extractionGate]) {
      const acquire = vi.spyOn(gate, "acquire").mockReturnValue(undefined);
      try {
        const result = await upload(fixtures[0]!.bytes, "a.txt");
        expectJsonError(result, 503, "busy");
        expect(result.response.headers.get("retry-after")).toBe("5");
      } finally {
        acquire.mockRestore();
      }
    }
    expect(uploadGate.stats).toEqual({ active: 0, waiting: 0 });
    expect(extractionGate.stats).toEqual({ active: 0, waiting: 0 });
  });

  it("gives every gate place back after each request", async () => {
    const { extractionGate, uploadGate } = await import("./documents");
    await Promise.all([upload(fixtures[0]!.bytes, "a.txt"), upload(new Uint8Array([1, 2, 3]), "notes.rtf"), fetch(`${baseUrl}/documents/extract`, { method: "POST", headers: READER, body: new FormData() })]);
    await new Promise((resolve) => setImmediate(resolve));
    expect(uploadGate.stats).toEqual({ active: 0, waiting: 0 });
    expect(extractionGate.stats).toEqual({ active: 0, waiting: 0 });
  });

  it("rejects requests without a file, or with the wrong field name", async () => {
    const empty = await fetch(`${baseUrl}/documents/extract`, { method: "POST", headers: READER, body: new FormData() });
    expect(empty.status).toBe(400);
    expect(((await empty.json()) as { error: { code: string } }).error.code).toBe("no-file");

    expectJsonError(await upload(new Uint8Array(Buffer.from("hello")), "a.txt", "document"), 400, "bad-upload");
  });

  it("refuses an upload from nobody signed in before reading a byte of it", async () => {
    const body = new FormData();
    body.append("file", new Blob([new Uint8Array(fixtures[0]!.bytes)]), "a.txt");
    const anonymous = await fetch(`${baseUrl}/documents/extract`, { method: "POST", body });
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("www-authenticate")).toBe("Bearer");
    expect(((await anonymous.json()) as { error: { code: string } }).error.code).toBe("auth-required");
  });

  it("answers unknown API routes and unreadable JSON bodies as JSON too", async () => {
    const missing = await fetch(`${baseUrl}/no-such-route`);
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { error: { code: string } }).error.code).toBe("not-found");

    const badJson = await fetch(`${baseUrl}/documents/extract`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect(badJson.status).toBe(400);
    const text = await badJson.text();
    expect(text).not.toMatch(STACK_MARKERS);
    expect((JSON.parse(text) as { error: { code: string } }).error.code).toBe("bad-request");
  });
});
