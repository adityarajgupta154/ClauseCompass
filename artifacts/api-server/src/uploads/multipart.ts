import multer, { type Multer, type Options } from "multer";
import { MAX_FILE_BYTES } from "../extraction";
import { ApiError } from "../middlewares/api-error";
import { fileNameProblem, type FileNameProblem } from "./file-name";

/**
 * The one way documents come in. Both routes that take files share these
 * rules: the file lives in memory for the request and is never written to
 * disk; the byte cap is enforced while the body streams in, so an oversized
 * upload is cut off rather than buffered whole; the file name is checked
 * before a single byte of the file is kept, and the request is refused when
 * it is a path or otherwise not a name. The parser is asked for the name as
 * sent — its own default would silently reduce `../../etc/passwd` to
 * `passwd` and read the name in Latin-1, which turns a Devanagari name into
 * mojibake — so that the check sees what the client sent and the name shown
 * back is the one the person typed.
 */
export function documentUpload(limits: Pick<NonNullable<Options["limits"]>, "files" | "fields" | "fieldSize">): Multer {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_BYTES, ...limits },
    preservePath: true,
    defParamCharset: "utf8",
    fileFilter: (_req, file, callback) => {
      const problem = fileNameProblem(file.originalname);
      if (problem) callback(badFileName(problem));
      else callback(null, true);
    },
  });
}

const MESSAGE: Record<FileNameProblem, string> = {
  path: "The file's name looks like a folder path, which cannot be right for an upload. Choose the file again so only its own name is sent.",
  control: "The file's name contains characters that cannot be part of a name. Rename the file and try again.",
  "too-long": "The file's name is longer than any file system allows. Rename the file and try again.",
  empty: "The file has no name. Rename it and try again.",
};

/** The 400 a refused name is answered with. The name itself is never repeated back. */
export function badFileName(problem: FileNameProblem): ApiError {
  return new ApiError(400, "bad-filename", MESSAGE[problem]);
}
