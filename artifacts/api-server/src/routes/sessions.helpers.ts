import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, expect, vi } from "vitest";
import { CreateSessionResponse } from "@workspace/api-zod";
import type { LlmProvider } from "../llm";
import type * as LlmModule from "../llm";
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

export const llmControl = () => llm;

vi.mock("../llm", async (importOriginal) => {
  const actual = await importOriginal<typeof LlmModule>();
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
export let baseUrl: string;

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

export interface Upload {
  file?: { bytes: Uint8Array; name: string };
  older?: { bytes: Uint8Array; name: string };
  newer?: { bytes: Uint8Array; name: string };
  /** An extra part the route does not expect. */
  extra?: { field: string; bytes: Uint8Array; name: string };
  stage?: string;
  documentType?: string;
}

export interface Result {
  response: Response;
  text: string;
  json: () => Record<string, unknown>;
}

/** The reader every request signs in as unless a test says otherwise (AUTH_PROVIDER=mock accepts `mock:<uid>`). */
export const READER = "reader-one";
export const OTHER_READER = "reader-two";

export const asReader = (uid: string): Record<string, string> => ({ authorization: `Bearer mock:${uid}` });

export async function call(method: string, path: string, body?: FormData, headers: Record<string, string> | null = asReader(READER)): Promise<Result> {
  const response = await fetch(`${baseUrl}${path}`, { method, body, headers: headers ?? undefined });
  const text = await response.text();
  return { response, text, json: () => JSON.parse(text) as Record<string, unknown> };
}

export async function createSession(upload: Upload): Promise<Result> {
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
export async function openSession(upload: Upload): Promise<string> {
  const result = await createSession(upload);
  expect(result.response.status, result.text).toBe(201);
  return CreateSessionResponse.parse(result.json()).id;
}

const STACK_MARKERS = /\n\s+at\s|node_modules|<pre>|Error:\s|\.ts:\d+|\.mjs:\d+/;

export function expectJsonError(result: Result, status: number, code: string) {
  expect(result.response.status).toBe(status);
  expect(result.response.headers.get("content-type")).toMatch(/^application\/json/);
  expect(result.text).not.toMatch(STACK_MARKERS);
  const body = result.json() as { error: { code: string; message: string } };
  expect(Object.keys(body)).toEqual(["error"]);
  expect(body.error.code).toBe(code);
  expect(body.error.message.length).toBeGreaterThan(20);
}

const fixtures = loadFixtures();
export const rental = fixtures.find((fixture) => fixture.id === "rental-agreement")!;
export const rentalV2 = fixtures.find((fixture) => fixture.id === "rental-agreement-v2")!;
export const nda = fixtures.find((fixture) => fixture.id === "nda")!;

export const rentalUpload: Upload = { file: { bytes: rental.bytes, name: "rental.txt" }, stage: "before-signing" };
export const pairUpload: Upload = {
  older: { bytes: rental.bytes, name: "v1.txt" },
  newer: { bytes: rentalV2.bytes, name: "v2.txt" },
  stage: "compare-versions",
};

export const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

