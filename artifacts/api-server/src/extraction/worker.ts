import { parentPort } from "node:worker_threads";
import { isExtractionError } from "./errors";
import { extractDocument } from "./index";
import type { WorkerReply, WorkerRequest } from "./isolated";

/**
 * Worker-thread entry: parses one document and replies once. It runs with
 * its own heap cap and is terminated by the parent on timeout, so a hostile
 * file can only take this thread down, never the server. Errors travel as
 * plain data — an ExtractionError as its code and context, anything else as
 * name and message — and are rebuilt on the parent side.
 */

const port = parentPort;
if (!port) throw new Error("extraction worker started outside a worker thread");

port.once("message", async (request: WorkerRequest) => {
  let reply: WorkerReply;
  try {
    const document = await extractDocument(request);
    reply = { ok: true, document };
  } catch (err) {
    if (isExtractionError(err)) {
      const cause = err.cause instanceof Error ? { name: err.cause.name, message: err.cause.message } : undefined;
      reply = { ok: false, extraction: { code: err.code, kind: err.context.kind, cap: err.context.cap, unpacked: err.context.unpacked, cause } };
    } else {
      const error = err instanceof Error ? err : new Error(String(err));
      reply = { ok: false, unexpected: { name: error.name, message: error.message, stack: error.stack } };
    }
  }
  port.postMessage(reply);
});
