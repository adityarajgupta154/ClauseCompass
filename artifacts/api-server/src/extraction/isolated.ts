import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";
import { ExtractionError, type ExtractionErrorCode } from "./errors";
import { EXTRACTION_HEAP_MB, EXTRACTION_TIMEOUT_MS } from "./limits";
import { processMemoryWatch } from "./memory-watch";
import type { DocumentKind, ExtractedDocument, ExtractionInput } from "./types";

/**
 * Runs `extractDocument` in a fresh worker thread with a heap cap, a
 * deadline and a process-wide memory watch. Parsers decode untrusted input;
 * a file built to exhaust memory or spin the CPU takes down only its worker,
 * which is reported to the uploader as `too-complex`. The worker is created
 * per document: the start cost (~100 ms) is small next to an upload, and
 * nothing survives between documents.
 */

export type WorkerRequest = ExtractionInput;

export type WorkerReply =
  | { ok: true; document: ExtractedDocument }
  | {
      ok: false;
      extraction: {
        code: ExtractionErrorCode;
        kind?: DocumentKind;
        cap?: "pages" | "words";
        unpacked?: boolean;
        cause?: { name: string; message: string };
      };
    }
  | { ok: false; unexpected: { name: string; message: string; stack?: string } };

export interface IsolationOptions {
  timeoutMs?: number;
  heapMb?: number;
}

/**
 * The worker file: this source file when running from TypeScript (tests,
 * where the thread needs tsx to load it), the sibling bundle emitted by
 * build.mjs otherwise. tsx is resolved from this package, not the working
 * directory, because tests run from the repository root.
 */
function workerLocation(): { url: URL; execArgv: string[] } {
  if (import.meta.url.endsWith(".ts")) {
    const tsxLoader = createRequire(import.meta.url).resolve("tsx/package.json").replace(/package\.json$/, "dist/loader.mjs");
    return { url: new URL("./worker.ts", import.meta.url), execArgv: ["--import", tsxLoader] };
  }
  return { url: new URL("./extraction/worker.mjs", import.meta.url), execArgv: [] };
}

export function extractDocumentIsolated(input: ExtractionInput, options: IsolationOptions = {}): Promise<ExtractedDocument> {
  const timeoutMs = options.timeoutMs ?? EXTRACTION_TIMEOUT_MS;
  const heapMb = options.heapMb ?? EXTRACTION_HEAP_MB;
  const { url, execArgv } = workerLocation();

  return new Promise<ExtractedDocument>((resolve, reject) => {
    const worker = new Worker(url, {
      execArgv,
      resourceLimits: { maxOldGenerationSizeMb: heapMb },
      stdout: false,
      stderr: false,
    });
    let settled = false;
    const settle = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unwatch();
      outcome();
      void worker.terminate();
    };
    const timer = setTimeout(() => {
      settle(() => reject(new ExtractionError("too-complex", { cause: new Error(`worker exceeded ${timeoutMs} ms`) })));
    }, timeoutMs);
    const unwatch = processMemoryWatch().watch(() => {
      settle(() => reject(new ExtractionError("too-complex", { cause: new Error("process memory pressure while parsing") })));
    });

    worker.once("message", (reply: WorkerReply) => {
      settle(() => {
        if (reply.ok) resolve(reply.document);
        else if ("extraction" in reply) reject(rebuild(reply.extraction));
        else reject(Object.assign(new Error(`extraction worker failed: ${reply.unexpected.message}`), { workerStack: reply.unexpected.stack }));
      });
    });
    worker.once("error", (err) => {
      // Out of memory (ERR_WORKER_OUT_OF_MEMORY) or a crash before the reply.
      settle(() => reject(new ExtractionError("too-complex", { cause: err })));
    });
    worker.once("exit", (code) => {
      settle(() => reject(new ExtractionError("too-complex", { cause: new Error(`worker exited with code ${code} before replying`) })));
    });

    // The copy has its own buffer, so it can be handed over instead of cloned.
    const bytes = new Uint8Array(input.bytes);
    worker.postMessage({ bytes, filename: input.filename, mimeType: input.mimeType } satisfies WorkerRequest, [bytes.buffer]);
  });
}

function rebuild(error: Extract<WorkerReply, { ok: false; extraction: unknown }>["extraction"]): ExtractionError {
  const cause = error.cause ? Object.assign(new Error(error.cause.message), { name: error.cause.name }) : undefined;
  return new ExtractionError(error.code, { kind: error.kind, cap: error.cap, unpacked: error.unpacked, cause });
}
