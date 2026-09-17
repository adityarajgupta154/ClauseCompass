import { describe, expect, it } from "vitest";
import { parseSealingKey, SealedCodec, SealedValueError } from "./sealed";

/**
 * The sealing every value gets before it reaches a shared store: it round
 * trips, it is opaque, and it fails closed for the wrong key, a changed byte,
 * a moved value or a value that is not this format at all.
 */

const KEY = Buffer.alloc(32, 1);
const value = { chunks: [{ text: "The deposit is two months' rent.", page: 1 }], nested: { n: 3, ok: true } };

describe("SealedCodec", () => {
  it("round trips a value under the same key and context", async () => {
    const codec = new SealedCodec(KEY);
    const sealed = await codec.seal(value, "id/doc:primary");
    expect(await codec.open(sealed, "id/doc:primary")).toEqual(value);
  });

  it("produces a v1 base64 value with nothing of the plaintext in it, and a fresh one each time", async () => {
    const codec = new SealedCodec(KEY);
    const a = await codec.seal(value, "ctx");
    const b = await codec.seal(value, "ctx");
    expect(a).toMatch(/^v1:[A-Za-z0-9+/]+=*$/);
    expect(a).not.toBe(b);
    expect(Buffer.from(a.slice(3), "base64").toString("latin1")).not.toContain("deposit");
  });

  it("compresses: a long repetitive document is far smaller sealed than as JSON", async () => {
    const codec = new SealedCodec(KEY);
    const long = { chunks: Array.from({ length: 500 }, (_, index) => ({ text: `Clause ${index}: the tenant shall keep the premises in good repair.`, page: 1 })) };
    const sealed = await codec.seal(long, "ctx");
    expect(sealed.length).toBeLessThan(JSON.stringify(long).length / 4);
  });

  it("fails closed: wrong key, wrong context, altered bytes, or not a sealed value", async () => {
    const codec = new SealedCodec(KEY);
    const other = new SealedCodec(Buffer.alloc(32, 2));
    const sealed = await codec.seal(value, "id/doc:primary");
    await expect(other.open(sealed, "id/doc:primary")).rejects.toBeInstanceOf(SealedValueError);
    await expect(codec.open(sealed, "id/doc:newer")).rejects.toBeInstanceOf(SealedValueError);
    const bytes = Buffer.from(sealed.slice(3), "base64");
    bytes[20] = bytes[20]! ^ 0xff;
    await expect(codec.open(`v1:${bytes.toString("base64")}`, "id/doc:primary")).rejects.toBeInstanceOf(SealedValueError);
    await expect(codec.open("plain text", "id/doc:primary")).rejects.toBeInstanceOf(SealedValueError);
    await expect(codec.open("v1:AAAA", "id/doc:primary")).rejects.toBeInstanceOf(SealedValueError);
  });

  it("takes only a 32-byte key", () => {
    expect(() => new SealedCodec(Buffer.alloc(16))).toThrow(RangeError);
  });
});

describe("parseSealingKey", () => {
  it("reads 64 hex characters or base64 of 32 bytes, and nothing else", () => {
    const hex = "ab".repeat(32);
    expect(parseSealingKey(hex)?.toString("hex")).toBe(hex);
    expect(parseSealingKey(` ${hex.toUpperCase()} `)?.toString("hex")).toBe(hex);
    const base64 = Buffer.alloc(32, 5).toString("base64");
    expect(parseSealingKey(base64)?.equals(Buffer.alloc(32, 5))).toBe(true);
    for (const bad of ["", "ab".repeat(31), "ab".repeat(33), "zz".repeat(32), Buffer.alloc(16).toString("base64"), "not a key"]) {
      expect(parseSealingKey(bad), bad).toBeUndefined();
    }
  });
});
