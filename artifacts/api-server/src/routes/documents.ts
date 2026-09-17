import { Router, type IRouter } from "express";
import { ExtractDocumentResponse } from "@workspace/api-zod";
import { requireUser } from "../auth";
import { extractDocumentIsolated, MAX_BUFFERED_UPLOADS, MAX_CONCURRENT_EXTRACTIONS, MAX_WAITING_EXTRACTIONS } from "../extraction";
import { ApiError } from "../middlewares/api-error";
import { heavyBudget } from "../middlewares/budgets";
import { admitThrough, busy, Gate } from "../middlewares/extraction-gate";
import { safeFileName } from "../uploads/file-name";
import { documentUpload } from "../uploads/multipart";

const router: IRouter = Router();

/**
 * Two gates, shared by every route that takes documents: how many uploads
 * may be held in memory at once (taken before the body is read), and how
 * many of them may be parsed at once (taken once the file has arrived, so a
 * slow connection cannot occupy a parser).
 */
export const uploadGate = new Gate(MAX_BUFFERED_UPLOADS, 0);
export const extractionGate = new Gate(MAX_CONCURRENT_EXTRACTIONS, MAX_WAITING_EXTRACTIONS);

/** One file and nothing else in the form (see uploads/multipart.ts for the rules every upload route shares). */
const upload = documentUpload({ files: 1, fields: 0 });

// Extraction costs a parser slot; only a signed-in reader gets one (the token is checked before the body is read).
router.use("/documents", requireUser);

/**
 * POST /api/documents/extract — stateless text extraction with locations.
 * Parsing happens in a worker with its own limits, behind the gates. Express
 * 5 routes a rejected promise to the error handler, which turns an
 * ExtractionError into its 4xx JSON body and anything else into a generic 500.
 */
router.post("/documents/extract", heavyBudget, admitThrough(uploadGate), upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) throw new ApiError(400, "no-file", "Attach one document in the `file` field.");

  const admission = extractionGate.acquire();
  if (!admission) throw busy(res);
  const release = await admission;
  try {
    // The client gave up while this request was queued: nothing to parse for.
    if (res.closed) return;

    const started = performance.now();
    const document = await extractDocumentIsolated({
      bytes: file.buffer,
      filename: safeFileName(file.originalname),
      mimeType: file.mimetype,
    });
    // The file name is not logged: names often carry the uploader's own name.
    req.log.info(
      {
        kind: document.kind,
        bytes: file.size,
        pageCount: document.pageCount,
        paragraphs: document.chunks.length,
        words: document.wordCount,
        ms: Math.round(performance.now() - started),
      },
      "document extracted",
    );
    res.json(ExtractDocumentResponse.parse(document));
  } finally {
    release();
  }
});

export default router;
