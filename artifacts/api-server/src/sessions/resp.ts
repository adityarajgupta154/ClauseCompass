/**
 * The Redis wire protocol (RESP2), as far as the socket client
 * (redis-socket.ts) and the test stand-in (testing/upstash-fake.ts) need
 * it. A command is an array of bulk strings; a reply is a simple string, an
 * error, an integer, a bulk string, an array of replies, or nil. Written
 * here so that the bytes on the wire are readable in one short file.
 *
 * The decoder is strict: a byte that is not one of the five type prefixes,
 * a length that is not an integer, or a bulk string that does not end in
 * CRLF is a RespProtocolError, and the caller drops the connection. Nothing
 * is guessed from a malformed frame.
 */

const CRLF = "\r\n";

/** The `-` reply: Redis refused the command. Carried as a value, so that one error inside an EXEC array does not lose the others. */
export class RespError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RespError";
  }
}

/** Bytes that are not RESP. */
export class RespProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RespProtocolError";
  }
}

export type RespValue = string | number | null | RespError | RespValue[];

/** A command as the client sends it: an array of bulk strings. */
export function encodeCommand(args: readonly (string | number)[]): Buffer {
  const parts: Buffer[] = [Buffer.from(`*${args.length}${CRLF}`)];
  for (const arg of args) {
    const bytes = Buffer.from(String(arg), "utf8");
    parts.push(Buffer.from(`$${bytes.length}${CRLF}`), bytes, Buffer.from(CRLF));
  }
  return Buffer.concat(parts);
}

/** A reply as a server sends it: integers, bulk strings, arrays, nil and errors. Simple strings are sent as bulk strings, which every client reads alike. */
export function encodeReply(value: RespValue): Buffer {
  if (value === null) return Buffer.from(`$-1${CRLF}`);
  if (typeof value === "number") return Buffer.from(`:${value}${CRLF}`);
  if (typeof value === "string") {
    const bytes = Buffer.from(value, "utf8");
    return Buffer.concat([Buffer.from(`$${bytes.length}${CRLF}`), bytes, Buffer.from(CRLF)]);
  }
  if (value instanceof RespError) return Buffer.from(`-${value.message}${CRLF}`);
  return Buffer.concat([Buffer.from(`*${value.length}${CRLF}`), ...value.map(encodeReply)]);
}

/**
 * Frames bytes into replies as they arrive; a reply split across chunks
 * waits for the rest. Chunks are kept as they came and joined only when a
 * frame may be complete: a bulk string's header says how many bytes it
 * needs, so a value of a megabyte arriving in many chunks is joined and
 * read once, not once per chunk.
 */
export class RespDecoder {
  private chunks: Buffer[] = [];
  private held = 0;
  /** How many held bytes the unfinished frame needs before it is worth reading again; 0 when unknown. */
  private need = 0;

  /** @param maxBytes how much of an unfinished frame may be held before the peer is deemed not to be speaking RESP. */
  constructor(private readonly maxBytes = 16 * 1024 * 1024) {}

  push(chunk: Buffer): RespValue[] {
    this.chunks.push(chunk);
    this.held += chunk.length;
    if (this.held > this.maxBytes) throw new RespProtocolError(`an unfinished frame exceeded ${this.maxBytes} bytes`);
    if (this.held < this.need) return [];
    const buffer = this.chunks.length === 1 ? this.chunks[0]! : Buffer.concat(this.chunks, this.held);
    const values: RespValue[] = [];
    let offset = 0;
    for (;;) {
      const frame = decodeAt(buffer, offset);
      if (typeof frame === "number") {
        this.need = frame - offset;
        break;
      }
      values.push(frame.value);
      offset = frame.end;
    }
    const rest = buffer.subarray(offset);
    this.chunks = rest.length === 0 ? [] : [rest];
    this.held = rest.length;
    return values;
  }
}

type Frame = { value: RespValue; end: number };

/**
 * One frame starting at `offset`, or, when the buffer does not hold all of
 * it yet, the buffer length that might: the end of a bulk string whose
 * header has arrived, otherwise just past what is held (any more bytes are
 * worth a look).
 */
function decodeAt(buffer: Buffer, offset: number): Frame | number {
  if (offset >= buffer.length) return buffer.length + 1;
  const type = buffer[offset];
  const lineEnd = buffer.indexOf(CRLF, offset + 1);
  if (lineEnd === -1) return buffer.length + 1;
  const line = buffer.toString("utf8", offset + 1, lineEnd);
  const next = lineEnd + CRLF.length;
  switch (type) {
    case 0x2b: // +
      return { value: line, end: next };
    case 0x2d: // -
      return { value: new RespError(line), end: next };
    case 0x3a: // :
      return { value: integer(line), end: next };
    case 0x24: {
      // $
      const length = integer(line);
      if (length === -1) return { value: null, end: next };
      if (length < 0) throw new RespProtocolError(`a bulk string of length ${length}`);
      const end = next + length + CRLF.length;
      if (buffer.length < end) return end;
      if (buffer[end - 2] !== 0x0d || buffer[end - 1] !== 0x0a) throw new RespProtocolError("a bulk string did not end in CRLF");
      return { value: buffer.toString("utf8", next, next + length), end };
    }
    case 0x2a: {
      // *
      const count = integer(line);
      if (count === -1) return { value: null, end: next };
      if (count < 0) throw new RespProtocolError(`an array of length ${count}`);
      const items: RespValue[] = [];
      let cursor = next;
      for (let index = 0; index < count; index += 1) {
        const item = decodeAt(buffer, cursor);
        if (typeof item === "number") return item;
        items.push(item.value);
        cursor = item.end;
      }
      return { value: items, end: cursor };
    }
    default:
      throw new RespProtocolError(`byte 0x${(type ?? 0).toString(16)} where a reply type was due`);
  }
}

function integer(line: string): number {
  if (!/^-?\d+$/.test(line)) throw new RespProtocolError(`"${line}" where an integer was due`);
  return Number(line);
}
