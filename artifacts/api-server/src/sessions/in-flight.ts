import type { OutputKind } from "./store";

/**
 * The preparations this process has in flight, by session. Two things live
 * here and not in the store, because both are about running work, which is
 * always local:
 *
 * - Sharing: concurrent requests for one output of one session join a
 *   single run instead of each calling the model. Requests that land on
 *   different instances of the API each run their own; the store's guarded
 *   write keeps that a cost, not a correctness, matter.
 * - Aborting: deleting a session aborts every run this process has for it,
 *   through the signal each run was started under, so the model call stops
 *   and nothing is kept. A run on another instance finishes on its own and
 *   finds no session to keep its output in.
 *
 * A question about the document (`run`) is the one kind of work here that
 * is not shared: nothing is kept for it, so two questions run side by side,
 * but each is started under the session's signal so a delete stops it too.
 */
export class InFlight<T extends Record<OutputKind, unknown>> {
  private readonly sessions = new Map<string, Entry<T>>();

  /** One unshared run under the session's signal: aborted with the rest when the session is deleted, forgotten when it ends. */
  run<R>(sessionId: string, start: (signal: AbortSignal) => Promise<R>): Promise<R> {
    const held = this.entry(sessionId);
    held.unshared += 1;
    return start(held.controller.signal).finally(() => {
      held.unshared -= 1;
      this.forget(sessionId, held);
    });
  }

  /** One run per session and kind at a time: a second caller gets the first caller's promise. */
  share<K extends OutputKind>(sessionId: string, kind: K, start: (signal: AbortSignal) => Promise<T[K]>): Promise<T[K]> {
    const held = this.entry(sessionId);
    // The mapped type does not narrow through a generic key; the cast keeps kind and promise type paired.
    const runs = held.runs as Partial<Record<K, Promise<T[K]>>>;
    const existing = runs[kind];
    if (existing) return existing;
    const run = start(held.controller.signal).finally(() => {
      delete runs[kind];
      this.forget(sessionId, held);
    });
    runs[kind] = run;
    return run;
  }

  private entry(sessionId: string): Entry<T> {
    let entry = this.sessions.get(sessionId);
    if (!entry) {
      entry = { controller: new AbortController(), runs: {}, unshared: 0 };
      this.sessions.set(sessionId, entry);
    }
    return entry;
  }

  /** Drops the session's entry once nothing runs under it, unless a delete already replaced it. */
  private forget(sessionId: string, held: Entry<T>): void {
    if (Object.keys(held.runs).length === 0 && held.unshared === 0 && this.sessions.get(sessionId) === held) this.sessions.delete(sessionId);
  }

  /** Aborts every run this process has for the session. A run started afterwards gets a fresh signal. */
  abort(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    this.sessions.delete(sessionId);
    entry.controller.abort(new Error("session deleted"));
  }

  /** How many sessions have a run in flight here; for tests. */
  get size(): number {
    return this.sessions.size;
  }
}

interface Entry<T extends Record<OutputKind, unknown>> {
  controller: AbortController;
  runs: Partial<{ [K in OutputKind]: Promise<T[K]> }>;
  /** Questions in flight; counted, not shared. */
  unshared: number;
}
