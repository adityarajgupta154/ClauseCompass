import type { RequestHandler } from "express";
import { ApiError } from "./api-error";

/**
 * Per-client request budgets: a token bucket per client address, refilled
 * continuously at `perMinute` tokens a minute and holding at most one
 * minute's worth, so a quiet client may burst up to its whole minute and a
 * busy one settles at the steady rate. A client over budget is answered 429
 * with a Retry-After hint and the API's usual error shape; nothing about the
 * request is read first, so an over-budget upload costs nothing to refuse.
 *
 * The state is per process (like the session store) and bounded: buckets
 * that have refilled are dropped by a sweep, and past `maxClients` the
 * client refilled longest ago is evicted, so a flood of addresses cannot
 * grow the map without limit.
 */

export interface RateLimitOptions {
  /** Tokens a client earns per minute, and the most it can hold. 0 disables the limiter (a pass-through). */
  perMinute: number;
  /** Upper bound on distinct clients tracked at once. */
  maxClients?: number;
  /** Clock in milliseconds; injectable for tests. */
  now?: () => number;
}

interface Bucket {
  tokens: number;
  /** When `tokens` was last brought up to date. */
  updatedAt: number;
}

const DEFAULT_MAX_CLIENTS = 10_000;
const SWEEP_EVERY_MS = 60_000;

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly capacity: number;
  private readonly perMs: number;
  private readonly maxClients: number;
  private readonly now: () => number;
  private lastSweep: number;

  constructor(options: RateLimitOptions) {
    if (!Number.isInteger(options.perMinute) || options.perMinute < 0) {
      throw new RangeError(`perMinute must be a whole number, not ${options.perMinute}`);
    }
    this.capacity = options.perMinute;
    this.perMs = options.perMinute / 60_000;
    this.maxClients = options.maxClients ?? DEFAULT_MAX_CLIENTS;
    this.now = options.now ?? Date.now;
    this.lastSweep = this.now();
  }

  get enabled(): boolean {
    return this.capacity > 0;
  }

  get stats() {
    return { clients: this.buckets.size };
  }

  /**
   * Spends one token for `client`. Returns the seconds until the next token
   * when there is none to spend (rounded up, at least 1), or 0 when the
   * request may go ahead. A disabled limiter always says 0.
   */
  take(client: string): number {
    if (!this.enabled) return 0;
    const now = this.now();
    this.sweep(now);
    const bucket = this.refilled(client, now);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return 0;
    }
    return Math.max(1, Math.ceil((1 - bucket.tokens) / this.perMs / 1000));
  }

  private refilled(client: string, now: number): Bucket {
    let bucket = this.buckets.get(client);
    if (!bucket) {
      if (this.buckets.size >= this.maxClients) this.evictOldest();
      bucket = { tokens: this.capacity, updatedAt: now };
      this.buckets.set(client, bucket);
      return bucket;
    }
    bucket.tokens = Math.min(this.capacity, bucket.tokens + (now - bucket.updatedAt) * this.perMs);
    bucket.updatedAt = now;
    return bucket;
  }

  /** Drops every bucket that would be full again by now, at most once a minute. */
  private sweep(now: number): void {
    if (now - this.lastSweep < SWEEP_EVERY_MS) return;
    this.lastSweep = now;
    for (const [client, bucket] of this.buckets) {
      if (bucket.tokens + (now - bucket.updatedAt) * this.perMs >= this.capacity) this.buckets.delete(client);
    }
  }

  private evictOldest(): void {
    let oldest: string | undefined;
    let oldestAt = Infinity;
    for (const [client, bucket] of this.buckets) {
      if (bucket.updatedAt < oldestAt) {
        oldestAt = bucket.updatedAt;
        oldest = client;
      }
    }
    if (oldest !== undefined) this.buckets.delete(oldest);
  }
}

/** The 429 every budget answers with. */
export function overBudget(res: { set(name: string, value: string): unknown }, retryAfterSeconds: number): ApiError {
  res.set("Retry-After", String(retryAfterSeconds));
  return new ApiError(429, "rate-limited", "Too many requests from this connection in a short time. Wait a moment and try again.");
}

/**
 * Charges each request to the client address Express resolved (`req.ip`:
 * the socket's peer, or the forwarded address when TRUST_PROXY says which
 * hops to believe, see app.ts) and refuses with 429 once the budget is
 * spent. With `perMinute` 0 the handler passes everything through, so a
 * disabled budget costs nothing per request.
 */
export function rateLimit(limiter: RateLimiter): RequestHandler {
  if (!limiter.enabled) return (_req, _res, next) => next();
  return (req, res, next) => {
    const retryAfter = limiter.take(req.ip ?? "unknown");
    if (retryAfter > 0) {
      next(overBudget(res, retryAfter));
      return;
    }
    next();
  };
}
