import { getConfig } from "./lib/config";

/**
 * The entry for a host that calls the app once per request instead of
 * starting a listener: Vercel imports it through /api/index.mjs at the repo
 * root (see /vercel.json). Same order as index.ts: the environment is
 * validated before any other application module is evaluated. There is no
 * process to exit here, so an invalid environment throws, the host reports
 * the failed invocation with the ConfigError's list of problems in its log,
 * and every request is refused until it is fixed; nothing runs half-set-up.
 *
 * On such a host PORT is not set, the session store must be one all
 * instances share (config.ts refuses the memory store when VERCEL=1), and a
 * process may be reused for many requests or none: the app keeps nothing per
 * process that a request depends on.
 */
getConfig();

const { default: app } = await import("./app");

export default app;

/**
 * pdf.js is not bundled (build.mjs keeps it external) and the extraction
 * worker loads it by a path computed at run time, which a host's file tracer
 * cannot follow. These imports never run; they exist so the tracer sees the
 * two modules named literally and ships them with the function.
 */
if (process.env.CLAUSECOMPASS_TRACE_HINTS === "never") {
  await import("pdfjs-dist/legacy/build/pdf.mjs");
  // @ts-expect-error the worker module ships no type declarations; it is named here for the tracer only.
  await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
}
