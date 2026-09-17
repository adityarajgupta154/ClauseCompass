import {
  IMAGE_EXTENSIONS,
  MAX_FILE_BYTES,
  MAX_FILE_LABEL,
  MIME_TO_KIND,
  type AcceptedKind,
} from "./constants";
import { copy } from "@/features/journey/copy";
import { formatBytes } from "@/lib/format";

export type RejectionCode =
  | "too-large"
  | "empty"
  | "unsupported-type"
  | "legacy-doc"
  | "image"
  | "media-mismatch";

export type FileCheck =
  | { ok: true; kind: AcceptedKind }
  | { ok: false; code: RejectionCode; message: string };

/** Only the fields the check needs, so tests can pass plain objects. */
export type FileLike = Pick<File, "name" | "size" | "type">;

function extensionOf(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return null;
  return name.slice(dot + 1).toLowerCase();
}

function kindOf(file: FileLike): AcceptedKind | null {
  const extension = extensionOf(file.name);
  if (extension === "pdf" || extension === "docx" || extension === "txt") {
    return extension;
  }
  if (extension === null) {
    return MIME_TO_KIND[file.type] ?? null;
  }
  return null;
}

/**
 * Pure, synchronous pre-flight check for a file the person picked or dropped.
 * Type is checked before size so a huge photo gets the photo guidance, not a
 * size complaint. Never throws.
 */
export function checkFile(file: FileLike): FileCheck {
  const extension = extensionOf(file.name);
  const kind = kindOf(file);

  if (kind === null) {
    if (extension === "doc") {
      return { ok: false, code: "legacy-doc", message: copy.upload.errors.legacyDoc };
    }
    if ((extension && IMAGE_EXTENSIONS.has(extension)) || file.type.startsWith("image/")) {
      return { ok: false, code: "image", message: copy.upload.errors.image };
    }
    return {
      ok: false,
      code: "unsupported-type",
      message: copy.upload.errors.unsupported(extension),
    };
  }

  // Browsers derive the MIME type from the extension, so a mismatch only
  // appears when the name lies about a media file. Anything subtler
  // (zip-as-docx, text-as-pdf) is the server's magic-byte check to catch.
  if (/^(image|audio|video)\//.test(file.type)) {
    if (file.type.startsWith("image/")) {
      return { ok: false, code: "image", message: copy.upload.errors.image };
    }
    return {
      ok: false,
      code: "media-mismatch",
      message: copy.upload.errors.mediaMismatch(extension ?? kind),
    };
  }

  if (file.size === 0) {
    return { ok: false, code: "empty", message: copy.upload.errors.empty };
  }
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      code: "too-large",
      message: copy.upload.errors.tooLarge(formatBytes(file.size), MAX_FILE_LABEL),
    };
  }

  return { ok: true, kind };
}
