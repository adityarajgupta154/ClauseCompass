import { inflateRawSync } from "node:zlib";

/**
 * Measures what a zip really expands to, within a budget, before any library
 * opens it. Every entry the zip library would read is located through the
 * central directory and, if deflated, inflated with a hard output cap — so a
 * "zip bomb" (a small file that inflates to gigabytes) is stopped at the
 * budget instead of at the end of memory. Nothing the archive declares about
 * itself is trusted: not the sizes, not the entry count.
 *
 * The walk mirrors what JSZip (mammoth's zip reader) does, so that what is
 * measured is what would be opened: the end-of-central-directory record is
 * the last one in the file, entries are read while their signature matches
 * regardless of the declared count, and a file with extra bytes before the
 * archive (a self-extractor stub) has its offsets shifted the same way.
 *
 * Results: `within` when the archive fits; `over` when the entry count or the
 * total inflated size exceeds the budget; `unreadable` when the archive
 * cannot be measured — callers must refuse such a file, because an archive
 * this code cannot follow is exactly what a hostile one would look like.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const EOCD_MIN_LENGTH = 22;
const MAX_COMMENT_LENGTH = 0xffff;
/** Placeholder meaning "see the ZIP64 record"; such archives are over any budget here. */
const ZIP64_MARKER = 0xffffffff;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

export interface ZipBudget {
  maxEntries: number;
  maxUnpackedBytes: number;
}

export type ZipMeasure = { result: "within"; entries: number; unpackedBytes: number } | { result: "over" } | { result: "unreadable" };

export function measureZip(bytes: Uint8Array, budget: ZipBudget): ZipMeasure {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view);
  if (eocd === undefined) return { result: "unreadable" };

  // Any of the four 16-bit fields (disk number, directory disk, entries on
  // this disk, entries in total) at 0xffff, or either 32-bit field at
  // 0xffffffff, makes JSZip read a separate ZIP64 directory instead of this
  // one. Such archives are refused outright rather than measured.
  for (const field of [4, 6, 8, 10]) if (view.getUint16(eocd + field, true) === 0xffff) return { result: "over" };
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  if (directorySize === ZIP64_MARKER || directoryOffset === ZIP64_MARKER) return { result: "over" };

  // Bytes before the archive proper shift every offset. JSZip always applies
  // this shift when the directory ends short of its end record, so the same
  // rule is used here — measuring a different directory than it would read
  // is exactly the gap a crafted archive would exploit.
  const extraBytes = eocd - (directoryOffset + directorySize);
  if (extraBytes < 0) return { result: "unreadable" };
  const shift = extraBytes;

  let offset = directoryOffset + shift;
  let entries = 0;
  let unpackedBytes = 0;
  while (offset + 46 <= eocd && hasSignature(view, offset, CENTRAL_HEADER_SIGNATURE)) {
    entries += 1;
    if (entries > budget.maxEntries) return { result: "over" };

    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    offset += 46 + nameLength + extraLength + commentLength;

    if (compressedSize === ZIP64_MARKER || localOffset === ZIP64_MARKER) return { result: "over" };
    const data = entryData(bytes, view, localOffset + shift, compressedSize);
    if (data === undefined) return { result: "unreadable" };

    const remaining = budget.maxUnpackedBytes - unpackedBytes;
    if (method === METHOD_STORED) {
      unpackedBytes += data.byteLength;
    } else if (method === METHOD_DEFLATE) {
      const inflated = inflateWithin(data, remaining);
      if (inflated === "over") return { result: "over" };
      if (inflated === "unreadable") return { result: "unreadable" };
      unpackedBytes += inflated;
    } else {
      // Rare methods (bzip2, LZMA, ...): not something a word processor writes.
      return { result: "unreadable" };
    }
    if (unpackedBytes > budget.maxUnpackedBytes) return { result: "over" };
  }
  if (entries === 0) return { result: "unreadable" };
  return { result: "within", entries, unpackedBytes };
}

function hasSignature(view: DataView, offset: number, signature: number): boolean {
  return offset >= 0 && offset + 4 <= view.byteLength && view.getUint32(offset, true) === signature;
}

/** The compressed bytes of one entry, located through its local header. */
function entryData(bytes: Uint8Array, view: DataView, localOffset: number, compressedSize: number): Uint8Array | undefined {
  if (localOffset + 30 > bytes.byteLength || !hasSignature(view, localOffset, LOCAL_HEADER_SIGNATURE)) return undefined;
  const nameLength = view.getUint16(localOffset + 26, true);
  const extraLength = view.getUint16(localOffset + 28, true);
  const start = localOffset + 30 + nameLength + extraLength;
  if (start + compressedSize > bytes.byteLength) return undefined;
  return bytes.subarray(start, start + compressedSize);
}

/** Inflates raw deflate data, giving up as soon as the output would pass the cap. */
function inflateWithin(data: Uint8Array, maxOutputLength: number): number | "over" | "unreadable" {
  if (maxOutputLength <= 0) return "over";
  try {
    return inflateRawSync(data, { maxOutputLength }).byteLength;
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    return code === "ERR_BUFFER_TOO_LARGE" ? "over" : "unreadable";
  }
}

function findEndOfCentralDirectory(view: DataView): number | undefined {
  const earliest = Math.max(0, view.byteLength - EOCD_MIN_LENGTH - MAX_COMMENT_LENGTH);
  for (let offset = view.byteLength - EOCD_MIN_LENGTH; offset >= earliest; offset--) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  return undefined;
}
