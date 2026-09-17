import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeDocx } from "../../artifacts/api-server/src/testing/make-docx";
import { makePdf } from "../../artifacts/api-server/src/testing/make-pdf";
import { bootApi, readerHeaders, type TestApi } from "../support/api-server";

/**
 * PRD §9 / Task 6.2: the four adversarial uploads — a file whose bytes are
 * not what its name says, an oversized file, an empty file, and a file whose
 * name is a path — against both routes that take documents, the way a
 * crafted client would send them. Each must be refused with the JSON error
 * body, without a session, without touching the file system, and without
 * anything escaping as an unhandled exception in the process that hosts the
 * API (the API runs in this process, so a stray rejection would surface
 * here). What a browser sends on its own is covered elsewhere; this suite
 * sends what a browser never would.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const STACK_MARKERS = /\n\s+at\s|node_modules|<pre>|Error:\s|\.ts:\d+|\.mjs:\d+/;
const RENTAL_TEXT = readFileSync(join(ROOT, "samples", "rental-agreement-synthetic.txt"));
const PARAGRAPHS = [
  "The Licensee has paid a security deposit of Rs. 60,000, the receipt of which the Licensor hereby acknowledges.",
  "Either party may terminate this agreement by giving the other one month's notice in writing.",
];

type Route = "extract" | "sessions";
interface Part {
  field: string;
  name: string;
  bytes: Uint8Array;
  type?: string;
}
interface Result {
  status: number;
  contentType: string | null;
  text: string;
  body: Record<string, unknown>;
}

let api: TestApi;
let uploadGate: { stats: { active: number; waiting: number } };
let extractionGate: { stats: { active: number; waiting: number } };
let sessionStore: { size: number };
const escaped: unknown[] = [];
const onUncaught = (error: unknown) => escaped.push(error);

beforeAll(async () => {
  process.on("uncaughtException", onUncaught);
  process.on("unhandledRejection", onUncaught);
  api = await bootApi();
  ({ uploadGate, extractionGate } = await import("../../artifacts/api-server/src/routes/documents"));
  sessionStore = (await import("../../artifacts/api-server/src/sessions")).getSessionStore();
});

afterAll(async () => {
  process.off("uncaughtException", onUncaught);
  process.off("unhandledRejection", onUncaught);
  await api.close();
});

function url(route: Route): string {
  return route === "extract" ? `${api.baseUrl}/documents/extract` : `${api.baseUrl}/sessions`;
}

async function finish(response: Response): Promise<Result> {
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // A non-JSON body fails the content-type assertion below with the text in view.
  }
  return { status: response.status, contentType: response.headers.get("content-type"), text, body };
}

/** What the upload screen or any ordinary HTTP client sends: fetch's own multipart encoding. */
async function post(route: Route, parts: Part[], fields: Record<string, string> = {}): Promise<Result> {
  const form = new FormData();
  if (route === "sessions") form.append("stage", fields.stage ?? (parts.length === 2 ? "compare-versions" : "before-signing"));
  for (const part of parts) form.append(part.field, new Blob([new Uint8Array(part.bytes)], { type: part.type ?? "text/plain" }), part.name);
  return finish(await fetch(url(route), { method: "POST", headers: readerHeaders(), body: form }));
}

/** The same request with the file name written into the header byte for byte, which fetch would refuse or escape. */
async function postRaw(route: Route, part: Part): Promise<Result> {
  const boundary = "----clausecompass-adversarial";
  const head = [
    ...(route === "sessions" ? [`--${boundary}\r\nContent-Disposition: form-data; name="stage"\r\n\r\nbefore-signing\r\n`] : []),
    `--${boundary}\r\nContent-Disposition: form-data; name="${part.field}"; filename="${part.name}"\r\nContent-Type: ${part.type ?? "text/plain"}\r\n\r\n`,
  ].join("");
  const body = Buffer.concat([Buffer.from(head, "utf8"), Buffer.from(part.bytes), Buffer.from(`\r\n--${boundary}--\r\n`, "utf8")]);
  return finish(await fetch(url(route), { method: "POST", headers: { ...readerHeaders(), "content-type": `multipart/form-data; boundary=${boundary}` }, body }));
}

function file(name: string, bytes: Uint8Array, type?: string): Part {
  return { field: "file", name, bytes, type };
}

function pair(older: Part, newer: Part): Part[] {
  return [
    { ...older, field: "older" },
    { ...newer, field: "newer" },
  ];
}

function expectRefusal(result: Result, status: number, code: string | readonly string[]): { code: string; message: string } {
  expect(result.status).toBe(status);
  expect(result.contentType).toMatch(/^application\/json/);
  expect(result.text).not.toMatch(STACK_MARKERS);
  expect(Object.keys(result.body)).toEqual(["error"]);
  const error = result.body.error as { code: string; message: string };
  if (typeof code === "string") expect(error.code).toBe(code);
  else expect(code).toContain(error.code);
  expect(error.message.length).toBeGreaterThan(20);
  return error;
}

const ROUTES: readonly Route[] = ["extract", "sessions"];
const pdfBytes = makePdf(PARAGRAPHS).bytes;
const docxBytes = makeDocx(PARAGRAPHS);
const textBytes = new Uint8Array(RENTAL_TEXT);
const pngBytes = new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(512, 0)]));

describe("a file whose bytes are not what its name says", () => {
  const disguises: Array<[label: string, name: string, bytes: Uint8Array, type: string]> = [
    ["a PDF named .txt", "agreement.txt", pdfBytes, "text/plain"],
    ["a PDF named .docx", "agreement.docx", pdfBytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["a DOCX named .pdf", "agreement.pdf", docxBytes, "application/pdf"],
    ["a DOCX named .txt", "agreement.txt", docxBytes, "text/plain"],
    ["a PNG named .pdf", "scan.pdf", pngBytes, "application/pdf"],
    ["a PNG named .docx", "scan.docx", pngBytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["a PNG named .txt", "scan.txt", pngBytes, "text/plain"],
    ["plain text named .pdf", "lease.pdf", textBytes, "application/pdf"],
    ["plain text named .PDF with a text MIME type", "lease.PDF", textBytes, "text/plain"],
  ];

  it.each(ROUTES)("is refused as a mismatch by %s, whatever the MIME header claims", async (route) => {
    for (const [label, name, bytes, type] of disguises) {
      const error = expectRefusal(await post(route, [file(name, bytes, type)]), 415, "format-mismatch");
      expect(error.message, label).not.toContain(name);
    }
  });

  it("is not rescued by a MIME header that disagrees with the extension: the extension is the claim, the bytes decide", async () => {
    // Text bytes, .txt name, a lying MIME type: the header changes nothing, the file is read as the text it is.
    const honest = await post("extract", [file("lease.txt", textBytes, "application/pdf")]);
    expect(honest.status).toBe(200);
    expect(honest.body.kind).toBe("txt");
    // PDF bytes, .txt name, a truthful MIME type: still refused, since the name is what the reader was told.
    expectRefusal(await post("extract", [file("lease.txt", pdfBytes, "application/pdf")]), 415, "format-mismatch");
  });

  it("names the version when one of two compared files is disguised, and opens no session", async () => {
    const before = sessionStore.size;
    const error = expectRefusal(await post("sessions", pair(file("v1.txt", textBytes), file("v2.txt", pdfBytes))), 415, "format-mismatch");
    expect(error.message.startsWith("The newer version:")).toBe(true);
    expect(sessionStore.size).toBe(before);
  });
});

describe("an oversized file", () => {
  const oversized = new Uint8Array(MAX_FILE_BYTES + 1).fill(0x61);

  it.each(ROUTES)("is cut off by %s with 413 while it streams in, before its type is even looked at", async (route) => {
    expectRefusal(await post(route, [file("big.txt", oversized)]), 413, "too-large");
    // Disguised and oversized: the size limit answers first, so nothing about the bytes is examined.
    expectRefusal(await post(route, [file("big.pdf", oversized, "application/pdf")]), 413, "too-large");
  });

  it("applies to each of two compared files on its own", async () => {
    const before = sessionStore.size;
    expectRefusal(await post("sessions", pair(file("v1.txt", textBytes), file("v2.txt", oversized))), 413, "too-large");
    expect(sessionStore.size).toBe(before);
  });
});

describe("an empty file", () => {
  const empty = new Uint8Array(0);

  it.each(ROUTES)("is refused by %s as empty, whichever type its name claims", async (route) => {
    for (const [name, type] of [
      ["empty.txt", "text/plain"],
      ["empty.pdf", "application/pdf"],
      ["empty.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ] as const) {
      expectRefusal(await post(route, [file(name, empty, type)]), 422, "empty");
    }
  });

  it("names the version when one of two compared files is empty", async () => {
    const before = sessionStore.size;
    const error = expectRefusal(await post("sessions", pair(file("v1.txt", textBytes), file("v2.txt", empty))), 422, "empty");
    expect(error.message.startsWith("The newer version:")).toBe(true);
    expect(sessionStore.size).toBe(before);
  });
});

describe("a file whose name is a path", () => {
  const cwd = process.cwd();
  const tmp = os.tmpdir();
  /** Where a naive `join(dir, name)` would have landed for the names below: whatever is absent before must be absent after. */
  const targets = ["../../etc/passwd", "passwd", "passwd.txt", "win.ini"].flatMap((name) => [resolve(cwd, name), resolve(tmp, name)]).filter((target) => !existsSync(target));
  /** Files named after the probes in the two directories a careless write would land in; the full listings are not compared, other suites use the temp directory too. */
  const probeFiles = () => [cwd, tmp].flatMap((dir) => readdirSync(dir).filter((entry) => /passwd|win\.ini/i.test(entry)).map((entry) => join(dir, entry)));
  const passwdStat = () => (existsSync("/etc/passwd") ? { size: statSync("/etc/passwd").size, mtimeMs: statSync("/etc/passwd").mtimeMs } : null);
  const traversals = [
    "../../etc/passwd",
    "..\\..\\etc\\passwd.txt",
    "/etc/passwd.txt",
    "C:\\Windows\\win.ini",
    "lease.txt/../../etc/passwd",
    "..",
    ".",
    // A direction override hiding the dots: the check runs on the cleaned name, so this is still `..`.
    "..\u202e",
    ".\u202e",
  ];

  it.each(ROUTES)("is refused by %s before the bytes are read, with real text content that would otherwise pass", async (route) => {
    const passwdBefore = passwdStat();
    const sessions = sessionStore.size;
    expect(targets.length).toBeGreaterThan(3);
    expect(probeFiles()).toEqual([]);

    for (const name of traversals) {
      const error = expectRefusal(await post(route, [file(name, textBytes)]), 400, "bad-filename");
      expect(error.message, name).not.toContain("passwd");
      expect(error.message, name).not.toContain("win.ini");
    }

    for (const target of targets) expect(existsSync(target), target).toBe(false);
    expect(probeFiles()).toEqual([]);
    expect(passwdStat()).toEqual(passwdBefore);
    expect(sessionStore.size).toBe(sessions);
  });

  it("is refused in either slot of a comparison", async () => {
    expectRefusal(await post("sessions", pair(file("../../etc/passwd", textBytes), file("v2.txt", textBytes))), 400, "bad-filename");
    expectRefusal(await post("sessions", pair(file("v1.txt", textBytes), file("..\\..\\etc\\passwd.txt", textBytes))), 400, "bad-filename");
  });

  it("is refused when the separator is smuggled past the encoding: a header-decoded newline, a tab, a NUL, a name no file system allows", async () => {
    // fetch encodes the newline as %0A; multer decodes it back, so the server sees the newline itself.
    expectRefusal(await post("extract", [file("lease\n.txt", textBytes)]), 400, "bad-filename");
    expectRefusal(await postRaw("extract", file("pass\twd.txt", textBytes)), 400, "bad-filename");
    // The multipart parser refuses a NUL inside a header before the name is looked at; either refusal is the safe one.
    expectRefusal(await postRaw("sessions", file("passwd.txt\u0000.pdf", textBytes)), 400, ["bad-upload", "bad-filename"]);
    expectRefusal(await post("sessions", [file("x".repeat(300) + ".txt", textBytes)]), 400, "bad-filename");
    expectRefusal(await postRaw("sessions", file("   ", textBytes)), 400, "bad-filename");
  });
});

describe("names that are odd but honest", () => {
  it("keeps a Unicode name as typed, strips direction overrides, and caps length without losing the extension", async () => {
    const cases: Array<[sent: string, kept: string]> = [
      ["किराया-समझौता.txt", "किराया-समझौता.txt"],
      ["notice\u202e.txt", "notice.txt"],
      ["  my   lease  (final).txt ", "my lease (final).txt"],
      ["x".repeat(200) + ".txt", "x".repeat(116) + ".txt"],
    ];
    for (const [sent, kept] of cases) {
      const result = await post("sessions", [file(sent, textBytes)]);
      expect(result.status, sent).toBe(201);
      const documents = result.body.documents as Array<{ name: string }>;
      expect(documents[0]!.name, sent).toBe(kept);
      await fetch(`${api.baseUrl}/sessions/${String(result.body.id)}`, { method: "DELETE", headers: readerHeaders() });
    }
  });
});

describe("afterwards", () => {
  it("the API is intact: every gate place is back, an honest upload still goes through, and nothing escaped as an unhandled exception", async () => {
    await new Promise((resolve) => setImmediate(resolve));
    expect(uploadGate.stats).toEqual({ active: 0, waiting: 0 });
    expect(extractionGate.stats).toEqual({ active: 0, waiting: 0 });

    const extracted = await post("extract", [file("rental-agreement.txt", textBytes)]);
    expect(extracted.status).toBe(200);
    expect((extracted.body.chunks as unknown[]).length).toBeGreaterThan(5);

    const opened = await post("sessions", [file("rental-agreement.txt", textBytes)]);
    expect(opened.status).toBe(201);
    await fetch(`${api.baseUrl}/sessions/${String(opened.body.id)}`, { method: "DELETE", headers: readerHeaders() });

    expect(escaped).toEqual([]);
  });
});
