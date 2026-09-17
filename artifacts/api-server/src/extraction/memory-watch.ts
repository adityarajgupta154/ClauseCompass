import { readFileSync } from "node:fs";
import { totalmem } from "node:os";
import { MEMORY_PRESSURE_SHARE, MEMORY_WATCH_INTERVAL_MS } from "./limits";

/**
 * Stops running extraction workers when the whole process grows too large.
 * A worker's V8 heap cap does not bound the typed arrays a decoder fills,
 * so a file built to inflate into gigabytes could still take the process
 * down; this watches resident memory while any worker runs and stops them
 * all once it passes a share of what the process may use. The limit comes
 * from the container's cgroup when there is one, else from physical memory.
 */

type Stop = () => void;

export interface MemoryWatchOptions {
  thresholdBytes: number;
  intervalMs: number;
  /** Resident set size probe; replaceable in tests. */
  rss?: () => number;
}

export class MemoryWatch {
  private readonly running = new Set<Stop>();
  private timer: NodeJS.Timeout | undefined;
  private readonly rss: () => number;

  constructor(private readonly options: MemoryWatchOptions) {
    this.rss = options.rss ?? (() => process.memoryUsage.rss());
  }

  get watching(): number {
    return this.running.size;
  }

  /** Registers a running worker's stop function; returns the deregistration function. */
  watch(stop: Stop): () => void {
    this.running.add(stop);
    this.timer ??= setInterval(() => this.check(), this.options.intervalMs).unref();
    return () => {
      this.running.delete(stop);
      if (this.running.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = undefined;
      }
    };
  }

  check(): void {
    if (this.rss() < this.options.thresholdBytes) return;
    for (const stop of [...this.running]) stop();
  }
}

/** The memory this process may use: the cgroup limit when there is one, else physical memory. */
export function memoryLimitBytes(): number {
  for (const path of ["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]) {
    try {
      const value = Number.parseInt(readFileSync(path, "utf8").trim(), 10);
      // cgroup v2 writes "max" (NaN here) and v1 a huge number when unlimited.
      if (Number.isFinite(value) && value > 0 && value < totalmem()) return value;
    } catch {
      // Not on this kind of host.
    }
  }
  return totalmem();
}

let shared: MemoryWatch | undefined;

/** The process-wide watch used by extraction workers (created on first use). */
export function processMemoryWatch(): MemoryWatch {
  shared ??= new MemoryWatch({
    thresholdBytes: Math.floor(memoryLimitBytes() * MEMORY_PRESSURE_SHARE),
    intervalMs: MEMORY_WATCH_INTERVAL_MS,
  });
  return shared;
}
