import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { ExtractionError } from "../extraction";
import { ApiError, apiErrorHandler } from "./api-error";

function fakeResponse() {
  const res = {
    headersSent: false,
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

function run(err: unknown) {
  const log = { error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
  const req = { log } as unknown as Request;
  const res = fakeResponse();
  const next = vi.fn();
  apiErrorHandler(err, req, res as unknown as Response, next);
  return { res, log, next };
}

describe("apiErrorHandler", () => {
  it("hides an unexpected error behind a generic 500 and logs it", () => {
    const { res, log } = run(new Error("ENOENT: /srv/secret/path.json, stack details"));
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: { code: "internal", message: expect.stringMatching(/went wrong on ClauseCompass.s side/) },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/ENOENT|secret|stack/);
    expect(log.error).toHaveBeenCalledOnce();
  });

  it("treats thrown non-errors the same way", () => {
    const { res } = run("a string thrown by someone");
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("someone");
  });

  it("passes an ExtractionError's status, code and message through; the cause is reduced to its category in the debug log", () => {
    const cause = new Error("Corrupted zip: missing entry word/Ramesh Kumar salary.xml (in tail)");
    const { res, log } = run(new ExtractionError("malformed", { kind: "pdf", cause }));
    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({ error: { code: "malformed", message: expect.stringMatching(/could not be read/) } });
    expect(JSON.stringify(res.body)).not.toContain("Corrupted zip");
    expect(log.warn).toHaveBeenCalledWith({ code: "malformed", status: 422 }, expect.any(String));
    expect(log.debug).toHaveBeenCalledOnce();
    const logged = log.debug.mock.calls[0]![0] as { cause: { name: string; category: string } };
    expect(logged.cause).toEqual({ name: "Error", category: "Corrupted zip" });
    expect(JSON.stringify(log.debug.mock.calls)).not.toContain("Ramesh");
  });

  it("passes an ApiError through unchanged", () => {
    const { res } = run(new ApiError(400, "no-file", "Attach one document."));
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: { code: "no-file", message: "Attach one document." } });
  });

  it("logs a deliberate 5xx ApiError as a refusal, not as an unhandled error", () => {
    const { res, log } = run(new ApiError(503, "busy", "Try again in a few seconds."));
    expect(res.statusCode).toBe(503);
    expect(log.error).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith({ code: "busy", status: 503 }, expect.any(String));
  });

  it("defers to Express once headers have been sent", () => {
    const err = new Error("late");
    const log = { error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
    const res = { ...fakeResponse(), headersSent: true };
    const next = vi.fn();
    apiErrorHandler(err, { log } as unknown as Request, res as unknown as Response, next);
    expect(next).toHaveBeenCalledWith(err);
    expect(res.body).toBeUndefined();
  });
});
