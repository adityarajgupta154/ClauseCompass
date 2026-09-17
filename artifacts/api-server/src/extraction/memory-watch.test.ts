import { afterEach, describe, expect, it, vi } from "vitest";
import { totalmem } from "node:os";
import { MemoryWatch, memoryLimitBytes } from "./memory-watch";

describe("MemoryWatch", () => {
  afterEach(() => vi.useRealTimers());

  it("stops every running worker once resident memory passes the threshold, and only then", () => {
    vi.useFakeTimers();
    let rss = 100;
    const watch = new MemoryWatch({ thresholdBytes: 500, intervalMs: 10, rss: () => rss });
    const stops = [vi.fn(), vi.fn()];
    const unwatchFirst = watch.watch(stops[0]!);
    watch.watch(stops[1]!);

    vi.advanceTimersByTime(50);
    expect(stops[0]).not.toHaveBeenCalled();
    expect(stops[1]).not.toHaveBeenCalled();

    unwatchFirst();
    rss = 600;
    vi.advanceTimersByTime(10);
    expect(stops[0]).not.toHaveBeenCalled();
    expect(stops[1]).toHaveBeenCalledOnce();
  });

  it("polls only while something is being watched", () => {
    vi.useFakeTimers();
    const rss = vi.fn(() => 0);
    const watch = new MemoryWatch({ thresholdBytes: 1, intervalMs: 10, rss });
    vi.advanceTimersByTime(30);
    expect(rss).not.toHaveBeenCalled();
    const unwatch = watch.watch(() => {});
    vi.advanceTimersByTime(30);
    expect(rss).toHaveBeenCalled();
    const calls = rss.mock.calls.length;
    unwatch();
    vi.advanceTimersByTime(30);
    expect(rss.mock.calls.length).toBe(calls);
    expect(watch.watching).toBe(0);
  });

  it("derives a positive limit no larger than physical memory", () => {
    const limit = memoryLimitBytes();
    expect(limit).toBeGreaterThan(0);
    expect(limit).toBeLessThanOrEqual(totalmem());
  });
});
