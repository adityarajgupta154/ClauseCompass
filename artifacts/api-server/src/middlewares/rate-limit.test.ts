import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./api-error";
import { RateLimiter, rateLimit } from "./rate-limit";

/**
 * The per-client budget: a client may burst up to a minute's worth, then
 * earns requests back at the steady rate; clients never share a bucket; the
 * map stays bounded; and the handler answers 429 in the API's error shape
 * with a Retry-After the client can act on.
 */

function clock(start = 0) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("RateLimiter", () => {
  it("admits a full minute's worth at once, then refuses until a token has refilled", () => {
    const time = clock();
    const limiter = new RateLimiter({ perMinute: 6, now: time.now });
    for (let i = 0; i < 6; i++) expect(limiter.take("a")).toBe(0);
    // One token takes 10 s at 6/min; Retry-After rounds up and is never 0.
    expect(limiter.take("a")).toBe(10);
    time.advance(9_999);
    expect(limiter.take("a")).toBe(1);
    time.advance(1);
    expect(limiter.take("a")).toBe(0);
    expect(limiter.take("a")).toBe(10);
  });

  it("refills continuously and never holds more than a minute's worth", () => {
    const time = clock();
    const limiter = new RateLimiter({ perMinute: 60, now: time.now });
    for (let i = 0; i < 60; i++) limiter.take("a");
    time.advance(30_000);
    for (let i = 0; i < 30; i++) expect(limiter.take("a"), `refilled request ${i}`).toBe(0);
    expect(limiter.take("a")).toBeGreaterThan(0);
    // A long silence refills to the cap, not beyond it.
    time.advance(10 * 60_000);
    for (let i = 0; i < 60; i++) expect(limiter.take("a")).toBe(0);
    expect(limiter.take("a")).toBeGreaterThan(0);
  });

  it("keeps one client's spending away from another's", () => {
    const limiter = new RateLimiter({ perMinute: 1, now: () => 0 });
    expect(limiter.take("a")).toBe(0);
    expect(limiter.take("a")).toBe(60);
    expect(limiter.take("b")).toBe(0);
  });

  it("is a pass-through at 0", () => {
    const limiter = new RateLimiter({ perMinute: 0 });
    expect(limiter.enabled).toBe(false);
    for (let i = 0; i < 1000; i++) expect(limiter.take("a")).toBe(0);
    expect(limiter.stats.clients).toBe(0);
  });

  it("never tracks more than maxClients, evicting the one refilled longest ago", () => {
    const time = clock();
    const limiter = new RateLimiter({ perMinute: 2, maxClients: 2, now: time.now });
    limiter.take("a");
    limiter.take("a"); // a is now empty
    time.advance(1);
    limiter.take("b");
    time.advance(1);
    limiter.take("c"); // evicts a, the oldest
    expect(limiter.stats.clients).toBe(2);
    // a comes back with a fresh bucket rather than its spent one.
    expect(limiter.take("a")).toBe(0);
  });

  it("drops buckets that would be full again, once a minute", () => {
    const time = clock();
    const limiter = new RateLimiter({ perMinute: 60, now: time.now });
    limiter.take("a");
    limiter.take("b");
    expect(limiter.stats.clients).toBe(2);
    time.advance(60_000);
    limiter.take("c"); // a and b have refilled by now and are swept
    expect(limiter.stats.clients).toBe(1);
  });

  it("refuses a negative or fractional rate", () => {
    expect(() => new RateLimiter({ perMinute: -1 })).toThrow(RangeError);
    expect(() => new RateLimiter({ perMinute: 1.5 })).toThrow(RangeError);
  });
});

describe("rateLimit handler", () => {
  function call(handler: ReturnType<typeof rateLimit>, ip: string) {
    const headers: Record<string, string> = {};
    const res = { set: vi.fn((name: string, value: string) => (headers[name] = value)) };
    const next = vi.fn();
    handler({ ip } as never, res as never, next);
    return { next, headers };
  }

  it("passes a client within budget and refuses one over it with 429, a code and Retry-After", () => {
    const handler = rateLimit(new RateLimiter({ perMinute: 1, now: () => 0 }));
    const first = call(handler, "10.0.0.1");
    expect(first.next).toHaveBeenCalledWith();
    expect(first.headers).toEqual({});

    const second = call(handler, "10.0.0.1");
    const err = second.next.mock.calls[0]![0] as unknown;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 429, code: "rate-limited" });
    expect((err as ApiError).message).not.toMatch(/10\.0\.0\.1/);
    expect(second.headers).toEqual({ "Retry-After": "60" });

    expect(call(handler, "10.0.0.2").next).toHaveBeenCalledWith();
  });

  it("costs nothing when the budget is off", () => {
    const limiter = new RateLimiter({ perMinute: 0 });
    const take = vi.spyOn(limiter, "take");
    const handler = rateLimit(limiter);
    expect(call(handler, "10.0.0.1").next).toHaveBeenCalledWith();
    expect(take).not.toHaveBeenCalled();
  });
});
