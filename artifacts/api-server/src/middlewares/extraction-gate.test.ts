import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./api-error";
import { admitThrough, Gate } from "./extraction-gate";

describe("Gate", () => {
  it("admits up to the slot count at once, queues the next, refuses past the queue", async () => {
    const gate = new Gate(2, 1);
    const first = gate.acquire();
    const second = gate.acquire();
    const third = gate.acquire();
    expect(first && second && third).toBeTruthy();
    expect(gate.stats).toEqual({ active: 2, waiting: 1 });
    expect(gate.acquire()).toBeUndefined();

    let admitted = false;
    void third!.then(() => (admitted = true));
    await Promise.resolve();
    expect(admitted).toBe(false);

    const releaseFirst = await first!;
    releaseFirst();
    releaseFirst(); // a second release is a no-op
    await third!;
    expect(admitted).toBe(true);
    expect(gate.stats).toEqual({ active: 2, waiting: 0 });
  });

  it("hands slots to waiters in arrival order", async () => {
    const gate = new Gate(1, 3);
    const order: string[] = [];
    const holder = await gate.acquire()!;
    const a = gate.acquire()!.then((release) => (order.push("a"), release));
    const b = gate.acquire()!.then((release) => (order.push("b"), release));
    holder();
    (await a)();
    (await b)();
    expect(order).toEqual(["a", "b"]);
    expect(gate.stats).toEqual({ active: 0, waiting: 0 });
  });

  it("gives a two-place request both places together, in its turn", async () => {
    const gate = new Gate(2, 2);
    const single = await gate.acquire()!;
    const pairAdmission = gate.acquire(2)!;
    const laterSingle = gate.acquire()!;
    expect(gate.stats).toEqual({ active: 1, waiting: 2 });
    expect(gate.acquire()).toBeUndefined();

    const order: string[] = [];
    void pairAdmission.then(() => order.push("pair"));
    void laterSingle.then(() => order.push("single"));
    await Promise.resolve();
    expect(order).toEqual([]); // one slot is not enough for the pair, and the single behind it waits its turn

    single();
    const releasePair = await pairAdmission;
    expect(gate.stats).toEqual({ active: 2, waiting: 1 });
    releasePair();
    await laterSingle;
    expect(order).toEqual(["pair", "single"]);
    expect(gate.stats).toEqual({ active: 1, waiting: 0 });
  });

  it("refuses a request for more places than the gate has", () => {
    expect(() => new Gate(1, 0).acquire(2)).toThrow(RangeError);
    expect(() => new Gate(2, 0).acquire(0)).toThrow(RangeError);
  });
});

function fakeResponse() {
  const res = new EventEmitter() as EventEmitter & { closed: boolean; headers: Record<string, string>; set(name: string, value: string): void };
  res.closed = false;
  res.headers = {};
  res.set = (name, value) => {
    res.headers[name] = value;
  };
  return res;
}

const noRequest = {} as never;

describe("admitThrough", () => {
  it("can hold more than one place for a request, all given back together", () => {
    const gate = new Gate(3, 0);
    const middleware = admitThrough(gate, 2);
    const res = fakeResponse();
    const next = vi.fn();
    middleware(noRequest, res as never, next);
    return Promise.resolve().then(() => {
      expect(next).toHaveBeenCalledWith();
      expect(gate.stats).toEqual({ active: 2, waiting: 0 });
      expect(gate.acquire(2)).toBeUndefined();
      res.emit("close");
      expect(gate.stats).toEqual({ active: 0, waiting: 0 });
    });
  });

  it("admits while there is room and gives the place back when the response closes", async () => {
    const gate = new Gate(1, 0);
    const middleware = admitThrough(gate);
    const first = fakeResponse();
    const next = vi.fn();
    middleware(noRequest, first as never, next);
    await new Promise((resolve) => setImmediate(resolve));
    expect(next).toHaveBeenCalledWith();
    expect(gate.stats).toEqual({ active: 1, waiting: 0 });

    const second = fakeResponse();
    const nextSecond = vi.fn();
    middleware(noRequest, second as never, nextSecond);
    const refusal = nextSecond.mock.calls[0]![0] as ApiError;
    expect(refusal).toBeInstanceOf(ApiError);
    expect(refusal.status).toBe(503);
    expect(refusal.code).toBe("busy");
    expect(second.headers["Retry-After"]).toBe("5");

    first.emit("close");
    expect(gate.stats).toEqual({ active: 0, waiting: 0 });
  });

  it("releases at once if the connection closed before admission completed", async () => {
    const gate = new Gate(1, 0);
    const res = fakeResponse();
    res.closed = true;
    admitThrough(gate)(noRequest, res as never, vi.fn());
    await new Promise((resolve) => setImmediate(resolve));
    expect(gate.stats).toEqual({ active: 0, waiting: 0 });
  });
});
