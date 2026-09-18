import { writeSync } from "node:fs";
import { ConfigError, getConfig, type Config } from "./lib/config";

// Validate the environment before any other application module is evaluated
// (app and logger read config at import time, hence the dynamic imports
// below). A ConfigError is a deliberate refusal to start, so it is printed as
// a plain message, written synchronously so nothing is lost on exit, rather
// than as a stack trace.
function loadConfigOrExit(): Config & { port: number } {
  try {
    const config = getConfig();
    // PORT is optional in the schema because vercel.ts runs the same app with no listener; this entry is the listener.
    if (config.port === undefined) throw new ConfigError(["PORT: required; the port this server listens on"]);
    return { ...config, port: config.port };
  } catch (err) {
    if (err instanceof ConfigError) {
      writeSync(2, `${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}

const config = loadConfigOrExit();
const { logger } = await import("./lib/logger");
const { default: app } = await import("./app");

if (config.llm.provider === "mock") {
  logger.warn("LLM_PROVIDER=mock: no model calls will be made; analysis output is canned test data");
}
if (config.auth.provider === "mock") {
  logger.warn("AUTH_PROVIDER=mock: any `mock:<uid>` bearer token is accepted as a signed-in reader; for offline tests only");
}

const server = app.listen(config.port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info(
    {
      port: config.port,
      llm: {
        provider: config.llm.provider,
        model: config.llm.model,
        ...(config.llm.provider !== "mock"
          ? { keySource: config.llm.keySource, host: new URL(config.llm.baseUrl).host }
          : {}),
      },
      auth: config.auth.provider === "firebase" ? { provider: "firebase", projectId: config.auth.projectId } : { provider: "mock" },
      sessionStore:
        config.sessionStore.kind === "memory"
          ? { kind: "memory" }
          : { kind: "redis", transport: config.sessionStore.access.transport, host: new URL(config.sessionStore.access.url).host },
      sessionTtlMinutes: config.sessionTtlMinutes,
      uploadMaxMb: config.uploadMaxBytes / (1024 * 1024),
    },
    "Server listening",
  );
});

// A request (headers and body) must arrive within these windows, so slow or
// stalled uploads cannot hold connections and buffers indefinitely.
server.headersTimeout = 30_000;
server.requestTimeout = 120_000;
