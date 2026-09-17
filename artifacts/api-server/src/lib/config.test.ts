import { describe, expect, it } from "vitest";
import { ConfigError, DEFAULT_LLM_MODEL, parseEnv } from "./config";

/**
 * The model-access part of the environment: which key is used, from where,
 * and that the server never runs the real provider without one. And the
 * sign-in part: which project's tokens are accepted, and that the offline
 * stand-in never reaches production.
 */

const base = { PORT: "8080", NODE_ENV: "test", FIREBASE_PROJECT_ID: "clausecompass-test" };

describe("parseEnv: llm", () => {
  it("uses the hand-set Anthropic key against the public API by default", () => {
    const config = parseEnv({ ...base, ANTHROPIC_API_KEY: "sk-own" });
    expect(config.llm).toEqual({
      provider: "anthropic",
      apiKey: "sk-own",
      baseUrl: "https://api.anthropic.com",
      keySource: "own-key",
      model: DEFAULT_LLM_MODEL,
    });
  });

  it("accepts the Replit Anthropic AI integration's pair when no key is set by hand", () => {
    const config = parseEnv({
      ...base,
      AI_INTEGRATIONS_ANTHROPIC_API_KEY: "dummy",
      AI_INTEGRATIONS_ANTHROPIC_BASE_URL: "https://ai.replit.example/anthropic",
      LLM_MODEL: "claude-sonnet-5",
    });
    expect(config.llm).toEqual({
      provider: "anthropic",
      apiKey: "dummy",
      baseUrl: "https://ai.replit.example/anthropic",
      keySource: "replit-integration",
      model: "claude-sonnet-5",
    });
  });

  it("prefers the hand-set key when both are present", () => {
    const config = parseEnv({
      ...base,
      ANTHROPIC_API_KEY: "sk-own",
      ANTHROPIC_BASE_URL: "https://proxy.example",
      AI_INTEGRATIONS_ANTHROPIC_API_KEY: "dummy",
      AI_INTEGRATIONS_ANTHROPIC_BASE_URL: "https://ai.replit.example/anthropic",
    });
    expect(config.llm).toMatchObject({ keySource: "own-key", apiKey: "sk-own", baseUrl: "https://proxy.example" });
  });

  it("refuses to start the real provider with no key from either source, naming both", () => {
    const attempt = () => parseEnv({ ...base, AI_INTEGRATIONS_ANTHROPIC_BASE_URL: "https://ai.replit.example" });
    expect(attempt).toThrow(ConfigError);
    try {
      attempt();
    } catch (err) {
      const message = (err as ConfigError).message;
      expect(message).toContain("ANTHROPIC_API_KEY");
      expect(message).toContain("AI_INTEGRATIONS_ANTHROPIC_API_KEY");
      expect(message).not.toContain("sk-");
    }
  });

  it("never prints a key's value in a problem, even when it is malformed", () => {
    expect(() => parseEnv({ ...base, ANTHROPIC_API_KEY: "sk-own", ANTHROPIC_BASE_URL: "ftp://nope" })).toThrow(
      /ANTHROPIC_BASE_URL: must be an https URL \(http only for localhost\) \(got "ftp:\/\/nope"\)/,
    );
    expect(() => parseEnv({ ...base, ANTHROPIC_API_KEY: "sk-own", LLM_MODEL: "not a model" })).toThrow(
      /LLM_MODEL: must be a model id/,
    );
  });

  it("refuses plain http for anything but the local machine", () => {
    const withUrl = (url: string) => () => parseEnv({ ...base, ANTHROPIC_API_KEY: "sk-own", ANTHROPIC_BASE_URL: url });
    expect(withUrl("http://proxy.example/anthropic")).toThrow(/must be an https URL/);
    expect(withUrl("http://localhost:4010")().llm).toMatchObject({ baseUrl: "http://localhost:4010" });
    expect(withUrl("http://127.0.0.1:4010")().llm).toMatchObject({ baseUrl: "http://127.0.0.1:4010" });
    expect(() =>
      parseEnv({
        ...base,
        AI_INTEGRATIONS_ANTHROPIC_API_KEY: "dummy",
        AI_INTEGRATIONS_ANTHROPIC_BASE_URL: "http://ai.replit.example/anthropic",
      }),
    ).toThrow(/AI_INTEGRATIONS_ANTHROPIC_BASE_URL: must be an https URL/);
  });

  it("keeps the mock provider offline and out of production", () => {
    expect(parseEnv({ ...base, LLM_PROVIDER: "mock" }).llm).toEqual({ provider: "mock", model: DEFAULT_LLM_MODEL });
    expect(() => parseEnv({ ...base, NODE_ENV: "production", LLM_PROVIDER: "mock" })).toThrow(
      /not allowed when NODE_ENV=production/,
    );
  });
});

describe("parseEnv: auth", () => {
  const withModel = { ...base, ANTHROPIC_API_KEY: "sk-own" };

  it("accepts Firebase tokens for the named project by default", () => {
    expect(parseEnv(withModel).auth).toEqual({ provider: "firebase", projectId: "clausecompass-test" });
  });

  it("refuses to start the Firebase verifier without a project id, naming the variable", () => {
    const { FIREBASE_PROJECT_ID: _dropped, ...withoutProject } = withModel;
    expect(() => parseEnv(withoutProject)).toThrow(/FIREBASE_PROJECT_ID: required when AUTH_PROVIDER=firebase/);
    expect(() => parseEnv({ ...withModel, FIREBASE_PROJECT_ID: "Not A Project" })).toThrow(/FIREBASE_PROJECT_ID: must be a Firebase project id/);
  });

  it("reports a missing project id and a missing model key in one run", () => {
    let caught: unknown;
    try {
      parseEnv({ PORT: "8080", NODE_ENV: "test" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    const problems = (caught as ConfigError).problems.join("\n");
    expect(problems).toMatch(/ANTHROPIC_API_KEY/);
    expect(problems).toMatch(/FIREBASE_PROJECT_ID/);
  });

  it("keeps the mock verifier offline and out of production, with no project id needed", () => {
    const { FIREBASE_PROJECT_ID: _dropped, ...withoutProject } = withModel;
    expect(parseEnv({ ...withoutProject, AUTH_PROVIDER: "mock" }).auth).toEqual({ provider: "mock" });
    expect(() => parseEnv({ ...withModel, NODE_ENV: "production", AUTH_PROVIDER: "mock" })).toThrow(/AUTH_PROVIDER: "mock" is not allowed when NODE_ENV=production/);
    expect(() => parseEnv({ ...withModel, AUTH_PROVIDER: "none" })).toThrow(/AUTH_PROVIDER/);
  });
});

describe("parseEnv: published apps", () => {
  const withModel = { ...base, ANTHROPIC_API_KEY: "sk-own" };

  it("refuses both stand-ins inside a published Replit app even when NODE_ENV is not production", () => {
    const published = { ...withModel, NODE_ENV: "development", REPLIT_DEPLOYMENT: "1" };
    expect(() => parseEnv({ ...published, LLM_PROVIDER: "mock" })).toThrow(/LLM_PROVIDER: "mock" is not allowed .*REPLIT_DEPLOYMENT=1/);
    expect(() => parseEnv({ ...published, AUTH_PROVIDER: "mock" })).toThrow(/AUTH_PROVIDER: "mock" is not allowed .*REPLIT_DEPLOYMENT=1/);
    // The real providers are unaffected.
    expect(parseEnv(published).llm.provider).toBe("anthropic");
  });
});

describe("parseEnv: budgets and origins", () => {
  const withModel = { ...base, ANTHROPIC_API_KEY: "sk-own" };

  it("grants no cross-origin access, believes no forwarding header and applies the default budgets when nothing is set", () => {
    const config = parseEnv(withModel);
    expect(config.corsOrigins).toEqual([]);
    expect(config.trustProxy).toBe(false);
    expect(config.rateLimit).toEqual({ perMinute: 600, heavyPerMinute: 60 });
    expect(config.llmMaxConcurrent).toBe(8);
  });

  it("reads TRUST_PROXY as a flag, a hop count or a list of proxy addresses", () => {
    expect(parseEnv({ ...withModel, TRUST_PROXY: "TRUE" }).trustProxy).toBe(true);
    expect(parseEnv({ ...withModel, TRUST_PROXY: "2" }).trustProxy).toBe(2);
    expect(parseEnv({ ...withModel, TRUST_PROXY: "loopback, 10.0.0.0/8 ,fd00::/8, 203.0.113.7" }).trustProxy).toEqual([
      "loopback",
      "10.0.0.0/8",
      "fd00::/8",
      "203.0.113.7",
    ]);
  });

  it("refuses a TRUST_PROXY that is not one of those shapes, including the forms Express would throw on or misread", () => {
    const bad = [
      "0",
      "17",
      "yes",
      "999.0.0.1",
      "10.0.0.0/33",
      "app.example.org",
      "1, 2",
      // proxy-addr throws on these at app start, after config validation would have passed
      ":",
      "1:::2",
      "0.0.0.0/0",
      "::/0",
      // proxy-addr reads a leading zero as octal (010.0.0.0/8 is 8.0.0.0/8); zone ids it rejects
      "010.0.0.0/8",
      "fe80::1%eth0",
    ];
    for (const value of bad) {
      expect(() => parseEnv({ ...withModel, TRUST_PROXY: value }), value).toThrow(/TRUST_PROXY: must be false, true, a hop count from 1 to 16/);
    }
  });

  it("only accepts TRUST_PROXY values Express itself accepts", async () => {
    const { default: express } = await import("express");
    for (const value of ["true", "false", "1", "16", "loopback, linklocal, uniquelocal", "10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16", "::1, fd00::/8, ::ffff:203.0.113.7", "203.0.113.7/32, 2001:db8::/32"]) {
      const { trustProxy } = parseEnv({ ...withModel, TRUST_PROXY: value });
      expect(() => express().set("trust proxy", trustProxy), value).not.toThrow();
    }
  });

  it("reads a comma-separated origin list, trimming and skipping empty entries", () => {
    expect(parseEnv({ ...withModel, CORS_ORIGINS: " https://app.example.org, http://localhost:5173 ,, " }).corsOrigins).toEqual([
      "https://app.example.org",
      "http://localhost:5173",
    ]);
  });

  it("refuses an origin with a path, a plain-http host that is not local, or no scheme", () => {
    for (const bad of ["https://app.example.org/api", "http://app.example.org", "app.example.org", "https://user:pw@app.example.org"]) {
      expect(() => parseEnv({ ...withModel, CORS_ORIGINS: bad }), bad).toThrow(/CORS_ORIGINS: must be a comma-separated list of origins/);
    }
  });

  it("lets a budget be turned off with 0 and refuses anything that is not a whole number", () => {
    expect(parseEnv({ ...withModel, RATE_LIMIT_PER_MINUTE: "0", RATE_LIMIT_HEAVY_PER_MINUTE: "0" }).rateLimit).toEqual({ perMinute: 0, heavyPerMinute: 0 });
    expect(() => parseEnv({ ...withModel, RATE_LIMIT_PER_MINUTE: "-1" })).toThrow(/RATE_LIMIT_PER_MINUTE: must be a whole number between 0 and 100000/);
    expect(() => parseEnv({ ...withModel, RATE_LIMIT_HEAVY_PER_MINUTE: "many" })).toThrow(/RATE_LIMIT_HEAVY_PER_MINUTE/);
  });

  it("keeps the model-call cap between 1 and 64", () => {
    expect(parseEnv({ ...withModel, LLM_MAX_CONCURRENT: "2" }).llmMaxConcurrent).toBe(2);
    expect(() => parseEnv({ ...withModel, LLM_MAX_CONCURRENT: "0" })).toThrow(/LLM_MAX_CONCURRENT: must be a whole number between 1 and 64/);
    expect(() => parseEnv({ ...withModel, LLM_MAX_CONCURRENT: "65" })).toThrow(/LLM_MAX_CONCURRENT/);
  });
});

describe("parseEnv: session store, port and upload cap", () => {
  const withModel = { ...base, ANTHROPIC_API_KEY: "sk-own" };
  const key = "ab".repeat(32);
  const redis = { ...withModel, SESSION_STORE: "redis", SESSION_STORE_URL: "https://db.upstash.io", SESSION_STORE_TOKEN: "tok", SESSION_STORE_KEY: key };

  it("holds sessions in memory by default, with the port and a 10 MB upload cap", () => {
    const config = parseEnv(withModel);
    expect(config.sessionStore).toEqual({ kind: "memory" });
    expect(config.port).toBe(8080);
    expect(config.uploadMaxBytes).toBe(10 * 1024 * 1024);
  });

  it("reads the Redis store's REST URL, token and key, the key as hex or base64", () => {
    const config = parseEnv(redis);
    expect(config.sessionStore).toMatchObject({ kind: "redis", access: { transport: "rest", url: "https://db.upstash.io", token: "tok" } });
    expect(config.sessionStore.kind === "redis" && config.sessionStore.key.toString("hex")).toBe(key);
    const base64 = Buffer.from(key, "hex").toString("base64");
    const fromBase64 = parseEnv({ ...redis, SESSION_STORE_KEY: base64 }).sessionStore;
    expect(fromBase64.kind === "redis" && fromBase64.key.toString("hex")).toBe(key);
  });

  it("reads a redis:// or rediss:// URL as the database's socket, hand-set or as REDIS_URL, with the password in the URL and no token", () => {
    const socket = { ...withModel, SESSION_STORE: "redis", SESSION_STORE_URL: "rediss://default:pw@db.example.org:6380", SESSION_STORE_KEY: key };
    expect(parseEnv(socket).sessionStore).toMatchObject({ kind: "redis", access: { transport: "socket", url: "rediss://default:pw@db.example.org:6380" } });
    const injected = { ...withModel, SESSION_STORE: "redis", REDIS_URL: "rediss://default:pw@db.example.org:12345", SESSION_STORE_KEY: key };
    expect(parseEnv(injected).sessionStore).toMatchObject({ access: { transport: "socket", url: "rediss://default:pw@db.example.org:12345" } });
    expect(() => parseEnv({ ...socket, SESSION_STORE_TOKEN: "tok" })).toThrow(/SESSION_STORE_TOKEN: not read with a redis:\/\/ or rediss:\/\/ SESSION_STORE_URL/);
    expect(() => parseEnv({ ...injected, REDIS_URL: "redis://db.example.org/sessions" })).toThrow(/REDIS_URL: must be a redis:\/\/ or rediss:\/\/ URL \(the path must be empty or a database number\)/);
    expect(() => parseEnv({ ...injected, REDIS_URL: "rediss://default:p%zz@db.example.org" })).toThrow(/REDIS_URL: must be a redis:\/\/ or rediss:\/\/ URL \(the user name or password is not valid percent-encoding\)/);
  });

  it("takes a plain redis:// URL to this machine or its private network as it is, and to any other host only when SESSION_STORE_ALLOW_PLAINTEXT says so", () => {
    const socket = (url: string, extra: Record<string, string> = {}) => ({ ...withModel, SESSION_STORE: "redis", REDIS_URL: url, SESSION_STORE_KEY: key, ...extra });
    expect(parseEnv(socket("redis://default:pw@localhost:6379")).sessionStore).toMatchObject({ access: { transport: "socket" } });
    expect(parseEnv(socket("redis://default:pw@10.0.0.5:6379")).sessionStore).toMatchObject({ access: { transport: "socket" } });
    const remote = "redis://default:pw@redis-1.example.redns.redis-cloud.com:12345";
    const refusal = /REDIS_URL: a redis:\/\/ URL \(no TLS\) to a host beyond this machine and its private network would send the database password and the owners' uids in the clear.*rediss:\/\/.*SESSION_STORE_ALLOW_PLAINTEXT=true/;
    expect(() => parseEnv(socket(remote))).toThrow(refusal);
    expect(() => parseEnv(socket(remote))).not.toThrow(/pw@/);
    expect(() => parseEnv(socket(remote, { SESSION_STORE_ALLOW_PLAINTEXT: "false" }))).toThrow(refusal);
    expect(parseEnv(socket(remote, { SESSION_STORE_ALLOW_PLAINTEXT: "true" })).sessionStore).toMatchObject({ access: { transport: "socket", url: remote } });
    // The same rule for a hand-set URL, under its own name.
    expect(() => parseEnv({ ...withModel, SESSION_STORE: "redis", SESSION_STORE_URL: remote, SESSION_STORE_KEY: key })).toThrow(/SESSION_STORE_URL: a redis:\/\/ URL \(no TLS\)/);
    expect(() => parseEnv(socket(remote, { SESSION_STORE_ALLOW_PLAINTEXT: "yes" }))).toThrow(/SESSION_STORE_ALLOW_PLAINTEXT: Invalid enum value/);
  });

  it("falls back to the names the Upstash integration and console use, hand-set names winning and REST before the socket", () => {
    const integration = { ...withModel, SESSION_STORE: "redis", KV_REST_API_URL: "https://kv.upstash.io", KV_REST_API_TOKEN: "kv-tok", SESSION_STORE_KEY: key };
    expect(parseEnv(integration).sessionStore).toMatchObject({ access: { transport: "rest", url: "https://kv.upstash.io", token: "kv-tok" } });
    const console_ = { ...withModel, SESSION_STORE: "redis", UPSTASH_REDIS_REST_URL: "https://c.upstash.io", UPSTASH_REDIS_REST_TOKEN: "c-tok", SESSION_STORE_KEY: key };
    expect(parseEnv(console_).sessionStore).toMatchObject({ access: { transport: "rest", url: "https://c.upstash.io", token: "c-tok" } });
    expect(parseEnv({ ...integration, SESSION_STORE_URL: "https://own.upstash.io" }).sessionStore).toMatchObject({ access: { url: "https://own.upstash.io", token: "kv-tok" } });
    // Upstash's integration sets REDIS_URL beside its REST names; the REST pair is used.
    expect(parseEnv({ ...integration, REDIS_URL: "rediss://default:pw@kv.upstash.io:6379" }).sessionStore).toMatchObject({ access: { transport: "rest", url: "https://kv.upstash.io" } });
    // A hand-set socket URL beats an injected REST pair, and an injected token is then left alone.
    expect(parseEnv({ ...integration, SESSION_STORE_URL: "rediss://default:pw@own.example.org:6379" }).sessionStore).toMatchObject({ access: { transport: "socket" } });
  });

  it("refuses the Redis store without its URL, token or key, naming each, and never prints the token, the password or the key", () => {
    const attempt = () => parseEnv({ ...withModel, SESSION_STORE: "redis", SESSION_STORE_TOKEN: "secret-token" });
    expect(attempt).toThrow(/SESSION_STORE_URL: required when SESSION_STORE=redis.*REDIS_URL/);
    expect(attempt).toThrow(/SESSION_STORE_KEY: required when SESSION_STORE=redis.*openssl rand -hex 32/);
    expect(attempt).not.toThrow(/secret-token/);
    const noToken = () => parseEnv({ ...withModel, SESSION_STORE: "redis", SESSION_STORE_URL: "https://db.upstash.io", SESSION_STORE_KEY: key });
    expect(noToken).toThrow(/SESSION_STORE_TOKEN: required with an https SESSION_STORE_URL/);
    const badKey = () => parseEnv({ ...redis, SESSION_STORE_KEY: "too-short-secret" });
    expect(badKey).toThrow(/SESSION_STORE_KEY: must be 32 bytes as 64 hex characters/);
    expect(badKey).not.toThrow(/too-short-secret/);
    expect(() => parseEnv({ ...redis, SESSION_STORE_URL: "http://db.upstash.io" })).toThrow(/SESSION_STORE_URL: must be the database's https REST URL \(http only for localhost\) or its redis:\/\/ or rediss:\/\/ URL/);
    const badSocket = () => parseEnv({ ...withModel, SESSION_STORE: "redis", REDIS_URL: "redis://default:secret-pw@host?x=1", SESSION_STORE_KEY: key });
    expect(badSocket).toThrow(/REDIS_URL: must be a redis:\/\/ or rediss:\/\/ URL/);
    expect(badSocket).not.toThrow(/secret-pw/);
  });

  it("refuses the memory store on Vercel, where an instance per request shares nothing, and the stand-ins too", () => {
    const vercel = { ...withModel, NODE_ENV: "development", VERCEL: "1" };
    expect(() => parseEnv(vercel)).toThrow(/SESSION_STORE: "memory" is not allowed on Vercel \(VERCEL=1\)/);
    expect(() => parseEnv({ ...vercel, LLM_PROVIDER: "mock" })).toThrow(/LLM_PROVIDER: "mock" is not allowed .*VERCEL=1/);
    expect(parseEnv({ ...redis, VERCEL: "1" }).sessionStore.kind).toBe("redis");
  });

  it("lets PORT be unset for a host that calls the app per request; the listener entry insists on it", () => {
    const { PORT: _unused, ...withoutPort } = withModel;
    expect(parseEnv(withoutPort).port).toBeUndefined();
    expect(() => parseEnv({ ...withModel, PORT: "0" })).toThrow(/PORT: must be a whole number between 1 and 65535/);
  });

  it("caps uploads between 1 and 10 MB", () => {
    expect(parseEnv({ ...withModel, UPLOAD_MAX_MB: "4" }).uploadMaxBytes).toBe(4 * 1024 * 1024);
    expect(() => parseEnv({ ...withModel, UPLOAD_MAX_MB: "11" })).toThrow(/UPLOAD_MAX_MB: must be a whole number between 1 and 10/);
    expect(() => parseEnv({ ...withModel, UPLOAD_MAX_MB: "0" })).toThrow(/UPLOAD_MAX_MB/);
  });
});
