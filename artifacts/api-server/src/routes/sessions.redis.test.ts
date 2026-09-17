import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CreateSessionResponse, PrepareComparisonResponse, PrepareDocumentMapResponse } from "@workspace/api-zod";
import { FakeUpstash } from "../testing/upstash-fake";
import { fixtureParagraphs, loadFixtures } from "../testing/fixtures";

/**
 * The session routes with SESSION_STORE=redis (the configuration a host
 * that runs an instance per request needs): the same app, booted twice as
 * two instances over one database (testing/upstash-fake.ts standing in for
 * it), the first reaching it over the REST API and the second over the
 * socket as REDIS_URL names it, so that a session opened on one is read,
 * prepared, extended and deleted on the other whichever way each is wired,
 * and an unreachable database is a 503 the client can retry, not a lost
 * session or a 500. The rest of the resource's behaviour is covered once,
 * in sessions.test.ts, and is the same code.
 */

const fake = new FakeUpstash();
const servers: Server[] = [];
const instances: string[] = [];

/** Boots the app in this process; a second boot is a second instance (its own module registry, its own in-flight runs). */
async function bootInstance(): Promise<string> {
  vi.resetModules();
  const { default: app } = await import("../app");
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
}

beforeAll(async () => {
  const url = await fake.listen();
  process.env.NODE_ENV = "test";
  process.env.PORT = "1";
  process.env.LLM_PROVIDER = "mock";
  process.env.AUTH_PROVIDER = "mock";
  process.env.LOG_LEVEL = "silent";
  process.env.SESSION_TTL_MINUTES = "30";
  process.env.RATE_LIMIT_PER_MINUTE = "0";
  process.env.RATE_LIMIT_HEAVY_PER_MINUTE = "0";
  process.env.SESSION_STORE = "redis";
  process.env.SESSION_STORE_KEY = "0f".repeat(32);
  process.env.SESSION_STORE_URL = url;
  process.env.SESSION_STORE_TOKEN = fake.token;
  instances.push(await bootInstance());
  delete process.env.SESSION_STORE_URL;
  delete process.env.SESSION_STORE_TOKEN;
  process.env.REDIS_URL = await fake.listenSocket();
  instances.push(await bootInstance());
});

afterAll(async () => {
  for (const server of servers) await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await fake.close();
});

const READER = { authorization: "Bearer mock:reader-one" };

async function call(instance: number, method: string, path: string, body?: FormData) {
  const response = await fetch(`${instances[instance]}${path}`, { method, body, headers: READER });
  const text = await response.text();
  return { response, text, json: () => JSON.parse(text) as Record<string, unknown> };
}

const fixtures = loadFixtures();
const rental = fixtures.find((fixture) => fixture.id === "rental-agreement")!;
const rentalV2 = fixtures.find((fixture) => fixture.id === "rental-agreement-v2")!;

function upload(parts: Record<string, Uint8Array>, stage: string): FormData {
  const body = new FormData();
  for (const [field, bytes] of Object.entries(parts)) body.append(field, new Blob([new Uint8Array(bytes)]), `${field}.txt`);
  body.append("stage", stage);
  return body;
}

describe("sessions over a shared store", () => {
  it("opens on one instance and is read, prepared and deleted on the other", async () => {
    const created = await call(0, "POST", "/sessions", upload({ file: rental.bytes }, "before-signing"));
    expect(created.response.status, created.text).toBe(201);
    const { id } = CreateSessionResponse.parse(created.json());
    expect(fake.size).toBe(1);

    const shown = await call(1, "GET", `/sessions/${id}`);
    expect(shown.response.status).toBe(200);
    expect(shown.json()).toMatchObject({ id, stage: "before-signing" });

    const prepared = await call(1, "POST", `/sessions/${id}/document-map`);
    expect(prepared.response.status, prepared.text).toBe(200);
    const map = PrepareDocumentMapResponse.parse(prepared.json());
    expect(map.chunks.length).toBe(rental.golden.paragraphCount);

    // The output was kept in the database, sealed, and the first instance serves it as a lookup.
    expect(fake.field(`session:${id}`, "out:documentMap")).toMatch(/^v1:/);
    const again = await call(0, "POST", `/sessions/${id}/document-map`);
    expect(again.text).toBe(prepared.text);

    expect((await call(1, "DELETE", `/sessions/${id}`)).response.status).toBe(204);
    expect(fake.size).toBe(0);
    expect((await call(0, "GET", `/sessions/${id}`)).response.status).toBe(404);
    expect((await call(0, "POST", `/sessions/${id}/document-map`)).response.status).toBe(404);
  });

  it("holds both versions of a comparison for whichever instance compares them", async () => {
    const created = await call(1, "POST", "/sessions", upload({ older: rental.bytes, newer: rentalV2.bytes }, "compare-versions"));
    expect(created.response.status, created.text).toBe(201);
    const { id } = CreateSessionResponse.parse(created.json());
    const compared = await call(0, "POST", `/sessions/${id}/compare`);
    expect(compared.response.status, compared.text).toBe(200);
    const cards = PrepareComparisonResponse.parse(compared.json());
    expect(cards.changes.length).toBeGreaterThan(0);
    expect((await call(1, "DELETE", `/sessions/${id}`)).response.status).toBe(204);
  });

  it("writes no document text to the database in the clear", async () => {
    const created = await call(0, "POST", "/sessions", upload({ file: rental.bytes }, "before-signing"));
    const { id } = CreateSessionResponse.parse(created.json());
    await call(1, "POST", `/sessions/${id}/document-map`);
    const sent = JSON.stringify(fake.commands);
    for (const anchor of rental.golden.anchors) {
      expect(anchor.startsWith.length).toBeGreaterThan(10);
      expect(sent).not.toContain(anchor.startsWith);
    }
    expect(sent).not.toContain(fixtureParagraphs(rental)[0]!.slice(0, 40));
    await call(0, "DELETE", `/sessions/${id}`);
  });

  it("answers 503 store-unavailable with Retry-After when the database cannot be reached, over either transport, and recovers", async () => {
    const created = await call(0, "POST", "/sessions", upload({ file: rental.bytes }, "before-signing"));
    const { id } = CreateSessionResponse.parse(created.json());
    for (const instance of [0, 1]) {
      fake.failNext("network");
      const refused = await call(instance, "GET", `/sessions/${id}`);
      expect(refused.response.status).toBe(503);
      expect(refused.response.headers.get("retry-after")).toBe("5");
      expect(refused.json()).toEqual({ error: { code: "store-unavailable", message: expect.stringContaining("Try again") } });
      expect(refused.text).not.toMatch(/ECONNRESET|socket|fetch failed/);
      expect((await call(instance, "GET", `/sessions/${id}`)).response.status).toBe(200);
    }
    await call(0, "DELETE", `/sessions/${id}`);
  });

  it("reports the database through the health check: 200 while it answers, 503 store-unavailable while it does not", async () => {
    for (const instance of [0, 1]) {
      expect((await call(instance, "GET", "/healthz")).json()).toEqual({ status: "ok" });
      fake.failNext("network");
      const down = await call(instance, "GET", "/healthz");
      expect(down.response.status).toBe(503);
      expect(down.response.headers.get("retry-after")).toBe("5");
      expect(down.json()).toMatchObject({ error: { code: "store-unavailable" } });
      expect((await call(instance, "GET", "/healthz")).response.status).toBe(200);
    }
  });
});
