import type { RequestHandler } from "express";
import { ApiError } from "./api-error";

/**
 * Bounds how many documents are parsed at once. Each parse holds a file in
 * memory and runs a worker with its own heap cap, so the total is what the
 * process must be able to afford. Requests past the slots wait in a short
 * queue; past the queue the route answers 503 with a Retry-After hint.
 */
export class Gate {
  private active = 0;
  private readonly waiting: Array<{ places: number; admit: () => void }> = [];

  constructor(
    readonly slots: number,
    readonly maxWaiting: number,
  ) {}

  get stats() {
    return { active: this.active, waiting: this.waiting.length };
  }

  /**
   * Resolves with a release function once `places` slots are free together;
   * returns undefined at once when the queue is full. A request that needs
   * two places (two documents) takes both in one step, so two such requests
   * can never each hold one place while waiting for the other's. Waiters are
   * served in arrival order; a waiter needing more places holds up those
   * behind it until enough slots are free. Releasing twice is harmless.
   */
  acquire(places = 1): Promise<() => void> | undefined {
    if (!Number.isInteger(places) || places < 1 || places > this.slots) {
      throw new RangeError(`a request can hold between 1 and ${this.slots} places, not ${places}`);
    }
    if (this.waiting.length === 0 && this.active + places <= this.slots) {
      this.active += places;
      return Promise.resolve(this.releaser(places));
    }
    if (this.waiting.length >= this.maxWaiting) return undefined;
    return new Promise<() => void>((resolve) => {
      this.waiting.push({
        places,
        admit: () => {
          this.active += places;
          resolve(this.releaser(places));
        },
      });
    });
  }

  private releaser(places: number): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= places;
      while (this.waiting.length > 0 && this.active + this.waiting[0]!.places <= this.slots) {
        this.waiting.shift()!.admit();
      }
    };
  }
}

/**
 * Admits a request to a gate before its body is read, or answers 503 at
 * once. Used in front of the upload parser so that only a bounded number of
 * files can be buffering in memory. The place is given back when the
 * response is done or the connection drops (`close` fires for both).
 */
export function admitThrough(gate: Gate, places = 1): RequestHandler {
  return (_req, res, next) => {
    const admission = gate.acquire(places);
    if (!admission) {
      next(busy(res));
      return;
    }
    void admission.then((release) => {
      res.once("close", release);
      if (res.closed) release();
      next();
    });
  };
}

/** The 503 every gate answers with. */
export function busy(res: { set(name: string, value: string): unknown }): ApiError {
  res.set("Retry-After", "5");
  return new ApiError(503, "busy", "Too many documents are being processed right now. Try again in a few seconds.");
}
