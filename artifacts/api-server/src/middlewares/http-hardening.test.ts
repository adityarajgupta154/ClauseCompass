import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * What every response from the real app carries and refuses, as configured
 * through the environment: the security headers, no cross-origin access
 * unless CORS_ORIGINS grants it, the per-client budget's 429 in the API's
 * own error shape, and the JSON body cap. Each case boots the app afresh
 * (config is read once per module graph), so the environment is set before
 * the import and the modules are reset after.
 */

const BASE_ENV = { NODE_ENV: "test", PORT: "1", LLM_PROVIDER: "mock", AUTH_PROVIDER: "mock", LOG_LEVEL: "silent" };

let server: Server | undefined;
const previous = new Map<string, string | undefined>();

async function boot(env: Record<string, string>): Promise<string> {
  for (const [key, value] of Object.entries({ ...BASE_ENV, ...env })) {
    if (!previous.has(key)) previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  vi.resetModules();
  const { default: app } = await import("../app");
  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once("listening", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
}

afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
  for (const [key, value] of previous) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  previous.clear();
});

describe("security headers", () => {
  it("sends the hardening headers on every response and no server banner", async () => {
    const base = await boot({ RATE_LIMIT_PER_MINUTE: "0", RATE_LIMIT_HEAVY_PER_MINUTE: "0" });
    for (const path of ["/healthz", "/no-such-route"]) {
      const res = await fetch(`${base}${path}`);
      expect(res.headers.get("x-content-type-options"), path).toBe("nosniff");
      expect(res.headers.get("x-frame-options"), path).toBe("SAMEORIGIN");
      expect(res.headers.get("referrer-policy"), path).toBe("no-referrer");
      expect(res.headers.get("cross-origin-resource-policy"), path).toBe("same-origin");
      expect(res.headers.get("strict-transport-security"), path).toMatch(/max-age=\d+/);
      expect(res.headers.get("content-security-policy"), path).toMatch(/default-src 'self'/);
      expect(res.headers.get("x-powered-by"), path).toBeNull();
    }
  });
});

describe("cross-origin access", () => {
  it("grants nothing by default: no allow-origin header for any origin, and no preflight answer", async () => {
    const base = await boot({ RATE_LIMIT_PER_MINUTE: "0", RATE_LIMIT_HEAVY_PER_MINUTE: "0" });
    const res = await fetch(`${base}/healthz`, { headers: { origin: "https://elsewhere.example" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();

    const preflight = await fetch(`${base}/sessions`, {
      method: "OPTIONS",
      headers: { origin: "https://elsewhere.example", "access-control-request-method": "POST" },
    });
    expect(preflight.headers.get("access-control-allow-origin")).toBeNull();
    expect(preflight.headers.get("access-control-allow-methods")).toBeNull();
  });

  it("answers only the origins CORS_ORIGINS names, with the methods and headers the app uses", async () => {
    const base = await boot({
      RATE_LIMIT_PER_MINUTE: "0",
      RATE_LIMIT_HEAVY_PER_MINUTE: "0",
      CORS_ORIGINS: "https://app.example.org,http://localhost:5173",
    });
    const allowed = await fetch(`${base}/healthz`, { headers: { origin: "https://app.example.org" } });
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://app.example.org");
    expect(allowed.headers.get("vary")).toMatch(/Origin/);
    expect(allowed.headers.get("cross-origin-resource-policy")).toBe("cross-origin");

    const preflight = await fetch(`${base}/sessions`, {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(preflight.headers.get("access-control-allow-methods")).toBe("GET,POST,DELETE");
    expect(preflight.headers.get("access-control-allow-headers")).toBe("Authorization,Content-Type");
    expect(preflight.headers.get("access-control-allow-credentials")).toBeNull();

    const other = await fetch(`${base}/healthz`, { headers: { origin: "https://elsewhere.example" } });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("per-client budget", () => {
  it("answers 429 in the error shape with Retry-After once a client is over budget, and charges nothing to a route's body", async () => {
    const base = await boot({ RATE_LIMIT_PER_MINUTE: "2", RATE_LIMIT_HEAVY_PER_MINUTE: "0" });
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
    expect((await fetch(`${base}/healthz`)).status).toBe(200);

    const refused = await fetch(`${base}/healthz`);
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(refused.headers.get("content-type")).toMatch(/application\/json/);
    expect(await refused.json()).toEqual({
      error: { code: "rate-limited", message: expect.stringMatching(/Too many requests/) },
    });

    // The budget is spent before authentication or any body is looked at.
    const upload = await fetch(`${base}/sessions`, { method: "POST", body: "not even multipart" });
    expect(upload.status).toBe(429);
  });

  it("ignores a forwarding header by default, so a client cannot buy a fresh budget by forging one", async () => {
    const base = await boot({ RATE_LIMIT_PER_MINUTE: "1", RATE_LIMIT_HEAVY_PER_MINUTE: "0" });
    const from = (ip: string) => fetch(`${base}/healthz`, { headers: { "x-forwarded-for": ip } });
    expect((await from("203.0.113.1")).status).toBe(200);
    // Same socket peer, a different claimed address: the same budget.
    expect((await from("203.0.113.2")).status).toBe(429);
  });

  it("with TRUST_PROXY=<hops> charges the address the trusted proxy appended, not what the client put in front of it", async () => {
    const base = await boot({ RATE_LIMIT_PER_MINUTE: "1", RATE_LIMIT_HEAVY_PER_MINUTE: "0", TRUST_PROXY: "1" });
    // The test client is the socket peer, which one trusted hop treats as
    // the proxy; the last address in the header is then the one it wrote.
    const chain = (header: string) => fetch(`${base}/healthz`, { headers: { "x-forwarded-for": header } });
    expect((await chain("198.51.100.9, 203.0.113.1")).status).toBe(200);
    expect((await chain("198.51.100.10, 203.0.113.1")).status).toBe(429);
    expect((await chain("198.51.100.9, 203.0.113.2")).status).toBe(200);
  });

  it("with TRUST_PROXY=true charges the first forwarded address, for an edge that rewrites the header itself", async () => {
    const base = await boot({ RATE_LIMIT_PER_MINUTE: "1", RATE_LIMIT_HEAVY_PER_MINUTE: "0", TRUST_PROXY: "true" });
    const from = (ip: string) => fetch(`${base}/healthz`, { headers: { "x-forwarded-for": `${ip}, 10.0.0.2` } });
    expect((await from("203.0.113.1")).status).toBe(200);
    expect((await from("203.0.113.1")).status).toBe(429);
    expect((await from("203.0.113.2")).status).toBe(200);
  });
});

describe("request bodies", () => {
  it("refuses a JSON body over the cap as 413 in the error shape", async () => {
    const base = await boot({ RATE_LIMIT_PER_MINUTE: "0", RATE_LIMIT_HEAVY_PER_MINUTE: "0" });
    const res = await fetch(`${base}/healthz`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ padding: "x".repeat(17 * 1024) }),
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: { code: "too-large", message: "The request body is too large." } });
  });
});
