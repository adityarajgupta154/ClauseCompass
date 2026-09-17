import type { ErrorRequestHandler, RequestHandler } from "express";
import multer from "multer";
import { isExtractionError, MAX_FILE_BYTES } from "../extraction";

/**
 * Every failure on `/api` leaves as JSON `{ error: { code, message } }`
 * (the ErrorResponse schema). Express's default handler would answer with an
 * HTML page that includes the stack trace outside production; nothing here
 * ever forwards an exception's own message or stack to the client. Details
 * go to the request logger instead.
 */

/** A refusal the route itself decided on, with a message written for the client. */
export class ApiError extends Error {
  override readonly name = "ApiError";

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
  }
}

interface Problem {
  status: number;
  code: string;
  message: string;
}

const INTERNAL: Problem = {
  status: 500,
  code: "internal",
  message: "Something went wrong on ClauseCompass's side while handling this request. Try again in a moment.",
};

const MAX_FILE_MB = Math.round(MAX_FILE_BYTES / (1024 * 1024));

const BUSBOY_PARSE_FAILURE = /^(Malformed part header|Unexpected end of form|Unexpected end of multipart data|Missing Content-Type|Multipart: Boundary not found)/;

function isBodyParserError(err: unknown): err is Error & { type: string; status: number } {
  return err instanceof Error && typeof (err as { type?: unknown }).type === "string" && "status" in err;
}

function toProblem(err: unknown): Problem {
  if (err instanceof ApiError) return { status: err.status, code: err.code, message: err.message };
  if (isExtractionError(err)) return { status: err.status, code: err.code, message: err.message };

  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case "LIMIT_FILE_SIZE":
        return {
          status: 413,
          code: "too-large",
          message: `This file is larger than ${MAX_FILE_MB} MB, the maximum for one document.`,
        };
      case "LIMIT_FILE_COUNT":
      case "LIMIT_UNEXPECTED_FILE":
      case "LIMIT_PART_COUNT":
      case "LIMIT_FIELD_COUNT":
        return {
          status: 400,
          code: "bad-upload",
          message: "Send only the files this route expects, one per field, and nothing else in the form.",
        };
      default:
        return { status: 400, code: "bad-upload", message: "The upload could not be read. Try again." };
    }
  }

  // busboy's own parse failures reach here as plain Errors, past multer's typed ones.
  if (err instanceof Error && BUSBOY_PARSE_FAILURE.test(err.message)) {
    return { status: 400, code: "bad-upload", message: "The upload could not be read. Try again." };
  }

  if (isBodyParserError(err)) {
    if (err.type === "entity.too.large") {
      return { status: 413, code: "too-large", message: "The request body is too large." };
    }
    if (err.status >= 400 && err.status < 500) {
      return { status: err.status, code: "bad-request", message: "The request body could not be read." };
    }
  }

  return INTERNAL;
}

function causeCategory(message: string): string {
  return message.split(/[:\n(]/, 1)[0]!.trim().slice(0, 60);
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: "not-found", message: "There is no such API route." } });
};

export const apiErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const problem = toProblem(err);
  const log = req.log;
  if (problem === INTERNAL) {
    log?.error({ err }, "unhandled error while handling request");
  } else {
    log?.warn({ code: problem.code, status: problem.status }, "request refused");
    // The parser's own exception is mostly kept out of the logs: its text can
    // echo names from inside the uploaded file. Only its class and the
    // category before the first colon ("Corrupted zip", "Invalid PDF
    // structure") are recorded, at debug level.
    const cause = err instanceof Error && err.cause instanceof Error ? err.cause : undefined;
    if (cause) log?.debug({ code: problem.code, cause: { name: cause.name, category: causeCategory(cause.message) } }, "refusal cause");
  }
  res.status(problem.status).json({ error: { code: problem.code, message: problem.message } });
};
