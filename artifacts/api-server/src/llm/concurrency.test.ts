import { describe, expect, it } from "vitest";
import { limitConcurrency } from "./concurrency";
import { LlmError, type LlmProvider, type LlmRequest, type LlmResponse } from "./provider";

/**
 * The process-wide cap on model calls in flight: no more than the cap run at
 * once, the rest wait in arrival order, a slot is given back on failure too,
 * a caller that aborts while waiting never reaches the model, and past the
 * waiting room a call fails at once as `overloaded`.
 */

const request: LlmRequest = {
  model: "test",
  system: "",
  user: "",
  output: { name: "record_claims", description: "", schema: {} },
  maxTokens: 16,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function slowProvider() {
  const calls: Array<ReturnType<typeof deferred<LlmResponse>>> = [];
  const provider: LlmProvider = {
    name: "slow",
    complete() {
      const call = deferred<LlmResponse>();
      calls.push(call);
      return call.promise;
    },
  };
  return { provider, calls };
}

const done: LlmResponse = { output: {}, stop: "complete", usage: null };
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("limitConcurrency", () => {
  it("runs at most the cap at once and admits the next in arrival order", async () => {
    const { provider, calls } = slowProvider();
    const capped = limitConcurrency(provider, 2);
    const results = [1, 2, 3, 4].map(() => capped.complete(request));
    await tick();
    expect(calls).toHaveLength(2);
    calls[0]!.resolve(done);
    await tick();
    expect(calls).toHaveLength(3);
    calls[1]!.resolve(done);
    calls[2]!.resolve(done);
    await tick();
    expect(calls).toHaveLength(4);
    calls[3]!.resolve(done);
    await expect(Promise.all(results)).resolves.toHaveLength(4);
  });

  it("gives the slot back when the call fails", async () => {
    const { provider, calls } = slowProvider();
    const capped = limitConcurrency(provider, 1);
    const first = capped.complete(request);
    const second = capped.complete(request);
    await tick();
    expect(calls).toHaveLength(1);
    calls[0]!.reject(new LlmError("upstream", "boom", 500));
    await expect(first).rejects.toMatchObject({ kind: "upstream" });
    await tick();
    expect(calls).toHaveLength(2);
    calls[1]!.resolve(done);
    await expect(second).resolves.toBe(done);
  });

  it("lets an aborted caller go without ever calling the model", async () => {
    const { provider, calls } = slowProvider();
    const capped = limitConcurrency(provider, 1);
    const first = capped.complete(request);
    const controller = new AbortController();
    const waiting = capped.complete(request, controller.signal);
    await tick();
    controller.abort();
    calls[0]!.resolve(done);
    await first;
    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    await tick();
    expect(calls).toHaveLength(1);
  });

  it("fails at once as overloaded past the waiting room, without touching the model", async () => {
    const { provider, calls } = slowProvider();
    const capped = limitConcurrency(provider, 1, 1);
    const running = capped.complete(request);
    const waiting = capped.complete(request);
    await expect(capped.complete(request)).rejects.toMatchObject({ name: "LlmError", kind: "overloaded" });
    expect(calls).toHaveLength(1);
    calls[0]!.resolve(done);
    await running;
    await tick();
    calls[1]!.resolve(done);
    await waiting;
  });

  it("keeps the provider's name", () => {
    expect(limitConcurrency({ name: "mock", complete: async () => done }, 3).name).toBe("mock");
  });
});
