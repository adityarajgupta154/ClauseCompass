import { isIPv4, isIPv6 } from "node:net";
import { z } from "zod";

/**
 * Process environment, validated once at startup.
 *
 * Every variable the server reads is declared here so that a missing or
 * malformed value stops the process at boot with a readable message instead
 * of surfacing as a broken request later. The documented set lives in
 * /.env.example at the repo root.
 *
 * index.ts validates the environment before it imports any other application
 * module, so modules may call getConfig() freely, including at import time.
 * Keep it that way: a module evaluated before that check would turn a
 * ConfigError into a stack trace instead of the plain refusal message.
 */

export type LlmProvider = "anthropic" | "mock";

export type AuthProvider = "firebase" | "mock";

/** Where the Anthropic credentials came from; logged at boot, never the key itself. */
export type AnthropicKeySource = "own-key" | "replit-integration";

/** Cheap, fast, strong at structured output (PRD section 7.3(b)); available directly and through the Replit integration. */
export const DEFAULT_LLM_MODEL = "claude-haiku-4-5";
const ANTHROPIC_API_URL = "https://api.anthropic.com";

const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface Config {
  nodeEnv: "development" | "test" | "production";
  logLevel: LogLevel;
  /** Port the HTTP server listens on. */
  port: number;
  /** How long an uploaded document and its analysis stay in memory. */
  sessionTtlMinutes: number;
  /**
   * Model provider. "anthropic" talks to the Messages API at `baseUrl`, with
   * the key either set by hand (ANTHROPIC_API_KEY) or provisioned by the
   * Replit Anthropic AI integration. "mock" makes no model calls and exists
   * so the test suite runs offline; it is refused in production.
   */
  llm:
    | { provider: "anthropic"; apiKey: string; baseUrl: string; keySource: AnthropicKeySource; model: string }
    | { provider: "mock"; model: string };
  /**
   * Who may open a session. "firebase" accepts the ID tokens Firebase
   * Authentication issues for the named project (the web app signs the reader
   * in; this server only checks the token's signature and claims). "mock"
   * accepts `mock:<uid>` tokens so the test suite and the accessibility run
   * work offline; like the mock model, it is refused in production.
   */
  auth: { provider: "firebase"; projectId: string } | { provider: "mock" };
  /**
   * Browser origins other than the app's own that may call the API
   * (CORS_ORIGINS). Empty by default: the web app is served from the same
   * origin as `/api`, so no cross-origin access is granted at all.
   */
  corsOrigins: string[];
  /**
   * Per-client request budgets (RATE_LIMIT_PER_MINUTE for every /api route,
   * RATE_LIMIT_HEAVY_PER_MINUTE for uploads and analyses). 0 turns a budget
   * off; the offline test suite does that so its bursts are not throttled.
   */
  rateLimit: { perMinute: number; heavyPerMinute: number };
  /**
   * Which forwarding headers to believe when resolving the client address
   * that budgets are charged to (TRUST_PROXY, passed to Express's setting
   * of that name): `false` (default) charges the socket's peer and ignores
   * X-Forwarded-For entirely, so a client cannot choose its own bucket by
   * forging it; a hop count trusts that many proxies in front of the server
   * and reads the address the outermost of them appended; `true` believes
   * the header as sent, right only behind an edge that rewrites it; a list
   * of addresses or CIDRs trusts exactly those hops.
   */
  trustProxy: boolean | number | string[];
  /** How many model calls the process has in flight at once (LLM_MAX_CONCURRENT); the rest wait their turn. */
  llmMaxConcurrent: number;
}

export class ConfigError extends Error {
  override readonly name = "ConfigError";

  constructor(readonly problems: string[]) {
    super(
      [
        "ClauseCompass API cannot start: the environment is invalid.",
        ...problems.map((problem) => `  - ${problem}`),
        "See .env.example at the repo root for every variable and what it means.",
      ].join("\n"),
    );
  }
}

type EnvSource = Record<string, string | undefined>;

const wholeNumber = (min: number, max: number) =>
  z
    .string()
    .refine((value) => /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max, {
      message: `must be a whole number between ${min} and ${max}`,
    })
    .transform(Number);

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Keys and document excerpts travel over this URL, so plain http is allowed only to the local machine. */
function isAllowedApiUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname));
  } catch {
    return false;
  }
}

const httpUrl = z.string().refine(isAllowedApiUrl, { message: "must be an https URL (http only for localhost)" });

/** A browser origin: scheme and host only, https unless it is the local machine. */
function isOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === value && (url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)));
  } catch {
    return false;
  }
}

const TRUST_PROXY_MAX_HOPS = 16;
const TRUST_PROXY_NAMED = new Set(["loopback", "linklocal", "uniquelocal"]);

/**
 * One proxy hop as Express's `trust proxy` (proxy-addr) accepts it: one of
 * its named ranges, or an address with an optional prefix length. Node's
 * own address check is the grammar: it refuses the forms proxy-addr would
 * throw on at app start (`:`, `1:::2`) and, unlike proxy-addr, IPv4 octets
 * with a leading zero (`010.0.0.0`, which it would silently read as octal)
 * and zone ids. A prefix of 0 is refused too; proxy-addr rejects it.
 */
function isProxyHop(token: string): boolean {
  if (TRUST_PROXY_NAMED.has(token)) return true;
  const [address, prefix, ...rest] = token.split("/");
  if (address === undefined || rest.length > 0 || address.includes("%")) return false;
  const bits = isIPv4(address) ? 32 : isIPv6(address) ? 128 : 0;
  if (bits === 0) return false;
  if (prefix === undefined) return true;
  return /^\d{1,3}$/.test(prefix) && Number(prefix) >= 1 && Number(prefix) <= bits;
}

const TRUST_PROXY_MESSAGE = `must be false, true, a hop count from 1 to ${TRUST_PROXY_MAX_HOPS}, or a comma-separated list of proxy addresses or CIDRs (loopback, linklocal and uniquelocal are accepted as names)`;

/** TRUST_PROXY: `false` (default) | `true` | hop count | comma-separated addresses, CIDRs or named ranges. */
const trustProxy = z
  .string()
  .default("false")
  .transform((value, ctx): boolean | number | string[] => {
    const lowered = value.toLowerCase();
    if (lowered === "false") return false;
    if (lowered === "true") return true;
    if (/^\d+$/.test(value)) {
      const hops = Number(value);
      if (hops >= 1 && hops <= TRUST_PROXY_MAX_HOPS) return hops;
    } else {
      const hops = value.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
      if (hops.length > 0 && hops.every(isProxyHop)) return hops;
    }
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: TRUST_PROXY_MESSAGE });
    return z.NEVER;
  });

/** Comma-separated origins; the empty string (the default) means none. */
const originList = z
  .string()
  .default("")
  .transform((value) => value.split(",").map((part) => part.trim()).filter((part) => part.length > 0))
  .refine((origins) => origins.every(isOrigin), {
    message: "must be a comma-separated list of origins such as https://app.example.org (scheme and host only, https unless localhost)",
  });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  PORT: wholeNumber(1, 65535),
  LLM_PROVIDER: z.enum(["anthropic", "mock"]).default("anthropic"),
  LLM_MODEL: z
    .string()
    .regex(/^[a-z0-9][a-z0-9.-]*$/i, { message: "must be a model id such as claude-haiku-4-5" })
    .default(DEFAULT_LLM_MODEL),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_BASE_URL: httpUrl.default(ANTHROPIC_API_URL),
  AI_INTEGRATIONS_ANTHROPIC_API_KEY: z.string().optional(),
  AI_INTEGRATIONS_ANTHROPIC_BASE_URL: httpUrl.optional(),
  SESSION_TTL_MINUTES: wholeNumber(1, 24 * 60).default("30"),
  AUTH_PROVIDER: z.enum(["firebase", "mock"]).default("firebase"),
  FIREBASE_PROJECT_ID: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/, { message: "must be a Firebase project id such as my-project-1a2b3" })
    .optional(),
  CORS_ORIGINS: originList,
  TRUST_PROXY: trustProxy,
  RATE_LIMIT_PER_MINUTE: wholeNumber(0, 100_000).default("600"),
  RATE_LIMIT_HEAVY_PER_MINUTE: wholeNumber(0, 100_000).default("60"),
  LLM_MAX_CONCURRENT: wholeNumber(1, 64).default("8"),
  /** Set to "1" by Replit inside a published app; the mock providers are refused there whatever NODE_ENV says. */
  REPLIT_DEPLOYMENT: z.string().optional(),
});

/** Where a stand-in provider must never run: a production build, or any published Replit app. */
function isLiveEnvironment(env: EnvSource): boolean {
  return env.NODE_ENV === "production" || env.REPLIT_DEPLOYMENT === "1";
}

const LIVE_ONLY_MESSAGE = "is not allowed when NODE_ENV=production or inside a published app (REPLIT_DEPLOYMENT=1)";

/** True when the Replit Anthropic AI integration has provisioned both of its variables. */
function hasReplitIntegration(env: EnvSource): boolean {
  return env.AI_INTEGRATIONS_ANTHROPIC_API_KEY !== undefined && env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL !== undefined;
}

/** Rules that span variables. Evaluated alongside the field schema so one run reports every problem. */
function crossFieldProblems(env: EnvSource): string[] {
  const problems: string[] = [];
  const provider = env.LLM_PROVIDER ?? "anthropic";
  if (provider === "anthropic" && env.ANTHROPIC_API_KEY === undefined && !hasReplitIntegration(env)) {
    problems.push(
      "ANTHROPIC_API_KEY: required when LLM_PROVIDER=anthropic (the default) unless the Replit Anthropic AI integration is provisioned (AI_INTEGRATIONS_ANTHROPIC_BASE_URL and AI_INTEGRATIONS_ANTHROPIC_API_KEY); the server never falls back to running without a model. Set LLM_PROVIDER=mock only for offline tests.",
    );
  }
  if (provider === "mock" && isLiveEnvironment(env)) {
    problems.push(`LLM_PROVIDER: "mock" ${LIVE_ONLY_MESSAGE}`);
  }
  const auth = env.AUTH_PROVIDER ?? "firebase";
  if (auth === "firebase" && env.FIREBASE_PROJECT_ID === undefined) {
    problems.push(
      "FIREBASE_PROJECT_ID: required when AUTH_PROVIDER=firebase (the default); it is the project whose sign-in tokens this server accepts. Set AUTH_PROVIDER=mock only for offline tests.",
    );
  }
  if (auth === "mock" && isLiveEnvironment(env)) {
    problems.push(`AUTH_PROVIDER: "mock" ${LIVE_ONLY_MESSAGE}`);
  }
  return problems;
}

/** Empty and whitespace-only values count as unset, e.g. `ANTHROPIC_API_KEY=` in a .env file. */
function normalize(env: EnvSource): EnvSource {
  const cleaned: EnvSource = {};
  for (const [key, value] of Object.entries(env)) {
    const trimmed = value?.trim();
    if (trimmed) cleaned[key] = trimmed;
  }
  return cleaned;
}

/** Pure: validates an environment object. Throws ConfigError with one line per problem. */
export function parseEnv(source: EnvSource): Config {
  const env = normalize(source);
  const result = envSchema.safeParse(env);

  const problems = result.success
    ? []
    : result.error.issues.map((issue) => {
        const key = issue.path.join(".");
        const message =
          issue.code === z.ZodIssueCode.invalid_type && issue.received === "undefined" ? "required" : issue.message;
        const raw = env[key];
        const got = raw !== undefined && !key.endsWith("_KEY") ? ` (got "${raw}")` : "";
        return `${key}: ${message}${got}`;
      });
  problems.push(...crossFieldProblems(env));

  if (!result.success || problems.length > 0) {
    throw new ConfigError(problems);
  }

  const parsed = result.data;
  return {
    nodeEnv: parsed.NODE_ENV,
    logLevel: parsed.LOG_LEVEL,
    port: parsed.PORT,
    sessionTtlMinutes: parsed.SESSION_TTL_MINUTES,
    llm: resolveLlm(parsed),
    auth: resolveAuth(parsed),
    corsOrigins: parsed.CORS_ORIGINS,
    rateLimit: { perMinute: parsed.RATE_LIMIT_PER_MINUTE, heavyPerMinute: parsed.RATE_LIMIT_HEAVY_PER_MINUTE },
    trustProxy: parsed.TRUST_PROXY,
    llmMaxConcurrent: parsed.LLM_MAX_CONCURRENT,
  };
}

/** crossFieldProblems guarantees the project id exists when the provider is firebase. */
function resolveAuth(parsed: z.infer<typeof envSchema>): Config["auth"] {
  if (parsed.AUTH_PROVIDER === "mock") return { provider: "mock" };
  return { provider: "firebase", projectId: parsed.FIREBASE_PROJECT_ID as string };
}

/** A key set by hand wins over the platform-provisioned one; crossFieldProblems guarantees one of them exists. */
function resolveLlm(parsed: z.infer<typeof envSchema>): Config["llm"] {
  if (parsed.LLM_PROVIDER === "mock") return { provider: "mock", model: parsed.LLM_MODEL };
  if (parsed.ANTHROPIC_API_KEY !== undefined) {
    return {
      provider: "anthropic",
      apiKey: parsed.ANTHROPIC_API_KEY,
      baseUrl: parsed.ANTHROPIC_BASE_URL,
      keySource: "own-key",
      model: parsed.LLM_MODEL,
    };
  }
  return {
    provider: "anthropic",
    apiKey: parsed.AI_INTEGRATIONS_ANTHROPIC_API_KEY as string,
    baseUrl: parsed.AI_INTEGRATIONS_ANTHROPIC_BASE_URL as string,
    keySource: "replit-integration",
    model: parsed.LLM_MODEL,
  };
}

let cached: Config | undefined;

/** Validated configuration for this process; parsed on first call. */
export function getConfig(): Config {
  cached ??= parseEnv(process.env);
  return cached;
}
