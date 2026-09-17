import { spawn } from "node:child_process";
import http, { type Server } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MOCK_GOOGLE_USER } from "@/features/auth/auth-mock";

/**
 * The real API on a free port with the mock model provider and the mock
 * sign-in, for the suites that drive the routes end to end. The environment
 * is set before the app module loads, because its config is read at import
 * time.
 */

// The per-client budgets are off: every request here comes from 127.0.0.1 in a burst, and the budgets have their own tests.
const TEST_ENV = {
  NODE_ENV: "test",
  PORT: "1",
  LLM_PROVIDER: "mock",
  AUTH_PROVIDER: "mock",
  LOG_LEVEL: "silent",
  RATE_LIMIT_PER_MINUTE: "0",
  RATE_LIMIT_HEAVY_PER_MINUTE: "0",
} as const;

/**
 * The reader every helper here signs requests as; the API's AUTH_PROVIDER=mock
 * accepts `mock:<uid>`. The same reader the web app's mock sign-in uses, so a
 * session opened here is the mounted screens' own.
 */
export const TEST_READER_UID = MOCK_GOOGLE_USER.uid;

/** The bearer header a raw fetch needs to be the same reader as the helpers. */
export function readerHeaders(uid: string = TEST_READER_UID): Record<string, string> {
  return { authorization: `Bearer mock:${uid}` };
}
const SUPPORT_DIR = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = join(SUPPORT_DIR, "..", "..");
/**
 * Start, orderly stop and forced stop together stay inside vitest's 20 s
 * hook budget, so a stuck boot fails with its own message and its child
 * cleaned up, rather than with the hook's timeout and a stray process.
 */
const PROCESS_START_MS = 12_000;
const PROCESS_STOP_MS = 4_000;
const PROCESS_KILL_MS = 2_000;
const REQUEST_MS = 15_000;

export interface TestApi {
  /** `http://127.0.0.1:<port>/api` */
  baseUrl: string;
  close(): Promise<void>;
}

export async function bootApi(): Promise<TestApi> {
  const previous = Object.fromEntries(Object.keys(TEST_ENV).map((key) => [key, process.env[key]]));
  Object.assign(process.env, TEST_ENV);
  const { default: app } = await import("../../artifacts/api-server/src/app");
  const server: Server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return {
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
          }
          if (err) reject(err);
          else resolve();
        });
      }),
  };
}

/**
 * The same API in a child process, for the suites that run under happy-dom:
 * there, vitest rewrites `import.meta.url` inside the server's modules to
 * an http address and the extraction worker cannot be located, so the
 * server has to run outside the DOM environment. Slower to start than
 * `bootApi` and not open to `vi.mock`; the in-process boot is the default.
 */
export async function bootApiProcess(): Promise<TestApi> {
  // Node itself runs tsx's CLI (the .bin shim is a shell script, which Windows cannot spawn), resolved from the package that depends on it.
  const apiPackage = join(WORKSPACE_ROOT, "artifacts", "api-server", "package.json");
  const tsxCli = join(dirname(createRequire(apiPackage).resolve("tsx/package.json")), "dist", "cli.mjs");
  const child = spawn(process.execPath, [tsxCli, join(SUPPORT_DIR, "api-process.mts")], {
    cwd: WORKSPACE_ROOT,
    env: { ...process.env, ...TEST_ENV },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stderr: string[] = [];
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk.toString("utf8")));
  // SIGTERM first (pino flushes on it), SIGKILL when that is ignored, and a last deadline of its own so close() never waits on an exit that does not come.
  const stop = () =>
    new Promise<void>((resolve, reject) => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve();
        return;
      }
      const timers: ReturnType<typeof setTimeout>[] = [];
      const settle = (error?: Error) => {
        for (const timer of timers) clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      child.once("exit", () => settle());
      timers.push(setTimeout(() => child.kill("SIGKILL"), PROCESS_STOP_MS));
      timers.push(
        setTimeout(() => settle(new Error(`the API process (pid ${child.pid}) did not exit ${PROCESS_KILL_MS / 1000}s after SIGKILL`)), PROCESS_STOP_MS + PROCESS_KILL_MS),
      );
      if (!child.kill("SIGTERM")) settle();
    });
  try {
    const port = await new Promise<number>((resolve, reject) => {
      let stdout = "";
      const timer = setTimeout(
        () => reject(new Error(`the API process did not report a port within ${PROCESS_START_MS / 1000}s; stderr: ${stderr.join("")}`)),
        PROCESS_START_MS,
      );
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
        const match = /^LISTENING (\d+)$/m.exec(stdout);
        if (match) {
          clearTimeout(timer);
          resolve(Number(match[1]));
        }
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`the API process exited with ${code} before listening; stderr: ${stderr.join("")}`));
      });
      child.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    return { baseUrl: `http://127.0.0.1:${port}/api`, close: stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

export type Stage = "before-signing" | "problem-started" | "compare-versions";

export interface Upload {
  fileName: string;
  bytes: Uint8Array;
}

interface FilePart {
  field: string;
  fileName: string;
  bytes: Uint8Array;
}

/**
 * A multipart POST over node:http rather than fetch + FormData: the DOM
 * suites run under happy-dom, whose fetch encodes FormData in a way the
 * server's parser does not accept, and this one helper serves both
 * environments. The file name goes into the header as given, control
 * characters aside, which is how a browser sends it.
 */
function postMultipart(url: string, fields: Record<string, string>, files: FilePart[]): Promise<{ status: number; body: string }> {
  const boundary = `----clausecompass-test-${Math.random().toString(16).slice(2)}`;
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const header = (disposition: string, type?: string) =>
    encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; ${disposition}\r\n${type ? `Content-Type: ${type}\r\n` : ""}\r\n`);
  for (const [name, value] of Object.entries(fields)) {
    parts.push(header(`name="${name}"`), encoder.encode(`${value}\r\n`));
  }
  for (const file of files) {
    const safeName = file.fileName.replace(/["\r\n]/g, "_");
    parts.push(header(`name="${file.field}"; filename="${safeName}"`, "text/plain"), file.bytes, encoder.encode("\r\n"));
  }
  parts.push(encoder.encode(`--${boundary}--\r\n`));
  const body = Buffer.concat(parts.map((part) => Buffer.from(part)));
  return new Promise((resolve, reject) => {
    const request = http.request(
      url,
      {
        method: "POST",
        headers: { ...readerHeaders(), "content-type": `multipart/form-data; boundary=${boundary}`, "content-length": body.length },
        timeout: REQUEST_MS,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
        response.on("error", reject);
      },
    );
    request.on("timeout", () => request.destroy(new Error(`no response to the upload within ${REQUEST_MS / 1000}s`)));
    request.on("error", reject);
    request.end(body);
  });
}

/** Opens a session the way the upload screen does; the compare stage sends the two versions. */
export async function openSession(baseUrl: string, stage: Stage, primary: Upload, newer?: Upload): Promise<string> {
  const files: FilePart[] =
    stage === "compare-versions"
      ? [
          { field: "older", fileName: primary.fileName, bytes: primary.bytes },
          { field: "newer", fileName: (newer ?? primary).fileName, bytes: (newer ?? primary).bytes },
        ]
      : [{ field: "file", fileName: primary.fileName, bytes: primary.bytes }];
  const response = await postMultipart(`${baseUrl}/sessions`, { stage }, files);
  if (response.status !== 201) throw new Error(`opening a session for ${primary.fileName} answered ${response.status}: ${response.body}`);
  return (JSON.parse(response.body) as { id: string }).id;
}

export type PreparedOutput = "document-map" | "review-prompts" | "compare";

/** One prepare call; returns the raw body text so a suite can check the bytes the browser receives as well as the parsed shape. */
export async function prepare(baseUrl: string, sessionId: string, output: PreparedOutput): Promise<{ status: number; body: string }> {
  const response = await fetch(`${baseUrl}/sessions/${sessionId}/${output}`, { method: "POST", headers: readerHeaders(), signal: AbortSignal.timeout(REQUEST_MS) });
  return { status: response.status, body: await response.text() };
}
