import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { gunzip as gunzipCb, gzip as gzipCb } from "node:zlib";

/**
 * How a session's documents and outputs travel to a store outside this
 * process (redis-store.ts): serialised, compressed, then encrypted with
 * AES-256-GCM under a key only the API holds (SESSION_STORE_KEY). The store
 * therefore keeps ciphertext; whoever can read the database, or its backups,
 * cannot read a document, and a value moved to another session or another
 * field fails to open because the session id and field name are bound in as
 * associated data.
 *
 * Format: `v1:` + base64(iv ‖ ciphertext ‖ tag), a fresh 12-byte iv per
 * value. The prefix exists so a later format can be told apart from this one.
 */

const gzip = promisify(gzipCb);
const gunzip = promisify(gunzipCb);

const PREFIX = "v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;
export const SEALING_KEY_BYTES = 32;

/** The value is not this codec's, was altered, or was sealed under another key. Which one is deliberately not distinguished. */
export class SealedValueError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SealedValueError";
  }
}

/** A 32-byte key written as 64 hex characters or as base64; anything else is undefined. */
export function parseSealingKey(text: string): Buffer | undefined {
  const trimmed = text.trim();
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return Buffer.from(trimmed, "hex");
  if (/^[A-Za-z0-9+/]{43}=?$/.test(trimmed)) {
    const key = Buffer.from(trimmed, "base64");
    if (key.length === SEALING_KEY_BYTES) return key;
  }
  return undefined;
}

export class SealedCodec {
  constructor(private readonly key: Buffer) {
    if (key.length !== SEALING_KEY_BYTES) throw new RangeError(`the sealing key must be ${SEALING_KEY_BYTES} bytes`);
  }

  /** `context` names where the value belongs (session id and field); the same context is needed to open it. */
  async seal(value: unknown, context: string): Promise<string> {
    const plain = await gzip(Buffer.from(JSON.stringify(value), "utf8"));
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(context, "utf8"));
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    return PREFIX + Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64");
  }

  async open<T>(sealed: string, context: string): Promise<T> {
    if (!sealed.startsWith(PREFIX)) throw new SealedValueError("not a sealed value");
    const bytes = Buffer.from(sealed.slice(PREFIX.length), "base64");
    if (bytes.length < IV_BYTES + TAG_BYTES) throw new SealedValueError("sealed value is too short");
    const iv = bytes.subarray(0, IV_BYTES);
    const tag = bytes.subarray(bytes.length - TAG_BYTES);
    const body = bytes.subarray(IV_BYTES, bytes.length - TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(tag);
    let plain: Buffer;
    try {
      plain = await gunzip(Buffer.concat([decipher.update(body), decipher.final()]));
    } catch (cause) {
      throw new SealedValueError("sealed value could not be opened", { cause });
    }
    try {
      return JSON.parse(plain.toString("utf8")) as T;
    } catch (cause) {
      throw new SealedValueError("sealed value is not JSON", { cause });
    }
  }
}
