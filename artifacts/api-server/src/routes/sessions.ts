import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateSessionResponse,
  GetRetentionPolicyResponse,
  GetSessionResponse,
  PrepareComparisonResponse,
  PrepareDocumentMapResponse,
  PrepareReviewPromptsResponse,
} from "@workspace/api-zod";
import { DOCUMENT_TYPES, isDocumentTypeId, isStageId, STAGE_IDS, type StageId } from "@workspace/rules";
import { AlignmentTooLargeError, analyzeDocument, analyzeReviewPrompts, compareDocuments, toSourceChunks } from "../analysis";
import { requireUser, userOf } from "../auth";
import { extractDocumentIsolated, isExtractionError, type ExtractedDocument } from "../extraction";
import { getConfig } from "../lib/config";
import { getLlmProvider } from "../llm";
import { ApiError } from "../middlewares/api-error";
import { admitAnalysis, heavyBudget } from "../middlewares/budgets";
import { admitThrough, busy } from "../middlewares/extraction-gate";
import { safeFileName } from "../uploads/file-name";
import { documentUpload } from "../uploads/multipart";
import {
  getSessionStore,
  SessionStoreFullError,
  type ApiSession,
  type OutputKind,
  type PreparedOutputs,
  type SessionDocument,
  type SlotId,
} from "../sessions";
import { extractionGate, uploadGate } from "./documents";

/**
 * The session resource (FR-12, PRD §9): the one upload, the short-lived
 * server-side session it opens, the outputs prepared inside it, and the
 * delete that ends it. See ../sessions/store.ts for what a session holds and
 * how it expires.
 */

const router: IRouter = Router();

/** The upload fields a session can take: `file` for one document, `older` + `newer` for a comparison. */
const UPLOAD_FIELDS = ["file", "older", "newer"] as const;
type UploadField = (typeof UPLOAD_FIELDS)[number];

const SLOT_OF: Record<UploadField, SlotId> = { file: "primary", older: "older", newer: "newer" };

/** Up to two documents plus two short text fields; anything longer than a field id is refused while it streams in. */
const upload = documentUpload({ files: 2, fields: 2, fieldSize: 64 }).fields(UPLOAD_FIELDS.map((name) => ({ name, maxCount: 1 })));

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readStage(value: unknown): StageId {
  if (!isStageId(value)) {
    throw new ApiError(400, "bad-stage", `Send \`stage\` as one of: ${STAGE_IDS.join(", ")}.`);
  }
  return value;
}

function readDocumentType(value: unknown) {
  if (value === undefined || value === "") return undefined;
  if (!isDocumentTypeId(value)) {
    throw new ApiError(400, "bad-document-type", `\`documentType\`, when sent, must be one of: ${DOCUMENT_TYPES.join(", ")}.`);
  }
  return value;
}

function fieldsFor(stage: StageId): readonly UploadField[] {
  return stage === "compare-versions" ? ["older", "newer"] : ["file"];
}

/** Which of the three fields carry a file, checked against what the stage needs: exactly those, no more. */
function checkUploadFields(stage: StageId, files: Partial<Record<UploadField, Express.Multer.File[]>>): readonly UploadField[] {
  const wanted = fieldsFor(stage);
  const present = UPLOAD_FIELDS.filter((field) => files[field]?.[0]);
  if (wanted.some((field) => !present.includes(field))) {
    throw new ApiError(
      400,
      "no-file",
      stage === "compare-versions"
        ? "Attach the earlier version in the `older` field and the later version in the `newer` field."
        : "Attach one document in the `file` field.",
    );
  }
  if (present.some((field) => !wanted.includes(field))) {
    throw new ApiError(
      400,
      "bad-upload",
      stage === "compare-versions"
        ? "For compare-versions, send the two versions as `older` and `newer` and nothing in `file`."
        : `For the ${stage} stage, send one document in the \`file\` field and nothing in \`older\` or \`newer\`.`,
    );
  }
  return wanted;
}

/** Armed before any waiting, so a disconnect while queued or parsing is not missed. */
function disconnectSignal(res: Response): AbortSignal {
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) controller.abort();
  });
  return controller.signal;
}

/**
 * Extraction behind the same gate as /documents/extract, under the name the
 * session will show. Returns null when the client disconnected before the
 * parser started, since nothing is kept to deliver later.
 */
async function extractUnderGate(file: Express.Multer.File, name: string, res: Response, signal: AbortSignal): Promise<ExtractedDocument | null> {
  const admission = extractionGate.acquire();
  if (!admission) throw busy(res);
  const release = await admission;
  try {
    if (signal.aborted) return null;
    return await extractDocumentIsolated({
      bytes: file.buffer,
      filename: name,
      mimeType: file.mimetype,
    });
  } finally {
    release();
  }
}

function describeDocument(document: ExtractedDocument) {
  return {
    kind: document.kind,
    pageCount: document.pageCount,
    wordCount: document.wordCount,
    paragraphCount: document.chunks.length,
  };
}

function sessionView(session: ApiSession) {
  return {
    id: session.id,
    stage: session.stage,
    documentType: session.documentType,
    ttlMinutes: getConfig().sessionTtlMinutes,
    expiresAt: new Date(session.expiresAt).toISOString(),
    documents: session.documents.map((held) => ({ slot: held.slot, name: held.name, document: describeDocument(held.document) })),
    outputs: {
      documentMap: session.outputs.documentMap !== undefined,
      reviewPrompts: session.outputs.reviewPrompts !== undefined,
      compare: session.outputs.compare !== undefined,
    },
  };
}

function sessionGone(cause?: unknown): ApiError {
  const minutes = getConfig().sessionTtlMinutes;
  return new ApiError(
    404,
    "session-not-found",
    `This session has ended. The document and everything prepared from it were deleted, either by you or automatically after ${minutes} ${minutes === 1 ? "minute" : "minutes"} without activity. Upload the document again to continue.`,
    cause === undefined ? undefined : { cause },
  );
}

/**
 * The live session named in the path, touched; 404 for anything else, with
 * no hint whether the id ever existed. Another reader's session is "anything
 * else": the answer is the same 404, so an id learned elsewhere confirms
 * nothing, and the refused request does not move its retention clock either
 * (the store decides ownership before it touches anything).
 */
function findSession(req: Request): ApiSession {
  const id = req.params.sessionId;
  if (typeof id !== "string" || !SESSION_ID.test(id)) throw sessionGone();
  const store = getSessionStore();
  const { uid } = userOf(req);
  const session = store.getOwned(id, uid);
  if (!session) {
    if (store.isSomeoneElses(id, uid)) req.log.warn("a session was requested by a reader who did not open it");
    throw sessionGone();
  }
  return session;
}

/** The document the map and the review prompts describe: the one document, or the newer version of a comparison. */
function documentOf(session: ApiSession): SessionDocument {
  const held = session.documents.find((entry) => entry.slot === "primary") ?? session.documents.find((entry) => entry.slot === "newer");
  if (!held) throw sessionGone();
  return held;
}

/**
 * One output, prepared once per session. A second request for it is a
 * lookup; concurrent requests share the run in flight. An output degraded by
 * the model being unavailable is returned but not kept, so a retry runs
 * again rather than repeating the degraded answer. If the session is deleted
 * while the run is in flight, the run is aborted through the session's
 * signal and the request ends as 404 like any other request for a gone
 * session.
 */
async function prepare<K extends OutputKind>(
  session: ApiSession,
  kind: K,
  compute: () => Promise<PreparedOutputs[K]>,
  keep: (output: PreparedOutputs[K]) => boolean,
): Promise<PreparedOutputs[K]> {
  const held = session.outputs[kind];
  if (held !== undefined) return held;
  // The mapped pending type does not narrow through a generic key; the cast keeps kind and promise type paired.
  const pending = session.pending as Partial<Record<K, Promise<PreparedOutputs[K]>>>;
  const start = () => {
    const run = compute()
      .then((output) => {
        if (!session.deleted && keep(output)) session.outputs[kind] = output;
        return output;
      })
      .finally(() => {
        delete pending[kind];
      });
    pending[kind] = run;
    return run;
  };
  let output: PreparedOutputs[K];
  try {
    output = await (pending[kind] ?? start());
  } catch (error) {
    if (session.deleted) throw sessionGone(error);
    throw error;
  }
  // A run that outlived its session (the provider ignored the abort, or finished first) still answers as gone.
  if (session.deleted) throw sessionGone();
  return output;
}

function modelOptions(req: Request, session: ApiSession) {
  return {
    stage: session.stage,
    documentType: session.documentType,
    provider: getLlmProvider(),
    model: getConfig().llm.model,
    log: req.log,
    signal: session.signal,
  };
}

const complete = {
  documentMap: (output: PreparedOutputs["documentMap"]) => !output.map.fields.some((field) => field.reason === "model-unavailable"),
  reviewPrompts: (output: PreparedOutputs["reviewPrompts"]) => !output.prompts.some((prompt) => prompt.reason === "model-unavailable"),
  compare: () => true,
};

/** GET /api/sessions/policy — the retention rule, for the notice shown before anything is uploaded. Open: it is a fact about the server, not about anyone's document. */
router.get("/sessions/policy", (_req, res) => {
  res.json(GetRetentionPolicyResponse.parse({ ttlMinutes: getConfig().sessionTtlMinutes }));
});

// Every session route below is the reader's own: opened for them, shown to them, ended by them.
router.use("/sessions", requireUser);

/**
 * POST /api/sessions — the one upload. Extraction runs behind the same gates
 * as /documents/extract, then the bytes are dropped and the extracted
 * documents open a session. A client that disconnects before extraction is
 * done opens nothing.
 */
router.post("/sessions", heavyBudget, admitThrough(uploadGate, 2), upload, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const stage = readStage(body.stage);
  const documentType = readDocumentType(body.documentType);
  const files = (req.files ?? {}) as Partial<Record<UploadField, Express.Multer.File[]>>;
  const fields = checkUploadFields(stage, files);

  const signal = disconnectSignal(res);
  const started = performance.now();
  const documents: SessionDocument[] = [];
  try {
    for (const field of fields) {
      const file = files[field]![0]!;
      const name = safeFileName(file.originalname);
      let document: ExtractedDocument | null;
      try {
        document = await extractUnderGate(file, name, res, signal);
      } catch (error) {
        // With two files a refusal names the version it is about, since the message would otherwise fit either.
        if (fields.length === 1 || !isExtractionError(error)) throw error;
        throw new ApiError(error.status, error.code, `The ${field} version: ${error.message}`, { cause: error.cause });
      }
      if (!document) return;
      documents.push({ slot: SLOT_OF[field], name, document });
      // The bytes are not needed past extraction; drop them so they never outlive this loop.
      delete files[field];
    }
  } finally {
    req.files = undefined;
  }
  if (signal.aborted) return;

  const store = getSessionStore();
  let session: ApiSession;
  try {
    session = store.create({ ownerUid: userOf(req).uid, stage, documentType, documents });
  } catch (error) {
    if (!(error instanceof SessionStoreFullError)) throw error;
    res.set("Retry-After", "60");
    throw new ApiError(503, "busy", "ClauseCompass is holding as many documents as it can right now. Try again in a few minutes.", { cause: error });
  }

  // Counts and kinds only: no text from the documents, no file names, no session id.
  req.log.info(
    {
      stage,
      documentType: documentType ?? null,
      documents: documents.map((held) => ({ slot: held.slot, kind: held.document.kind, paragraphs: held.document.chunks.length })),
      sessions: store.size,
      ms: Math.round(performance.now() - started),
    },
    "session opened",
  );
  res.status(201).json(CreateSessionResponse.parse(sessionView(session)));
});

/** GET /api/sessions/:sessionId — the session as it stands; reading it counts as activity. */
router.get("/sessions/:sessionId", (req, res) => {
  res.json(GetSessionResponse.parse(sessionView(findSession(req))));
});

/**
 * DELETE /api/sessions/:sessionId — ends the session: documents, outputs and
 * any preparation in flight. 204 whether or not it existed, so a repeat is
 * not an error and the answer says nothing about which ids are real. Only
 * the reader who opened it can end it; for anyone else it is one of the ids
 * that do not exist.
 */
router.delete("/sessions/:sessionId", (req, res) => {
  const id = req.params.sessionId;
  const store = getSessionStore();
  const existed = typeof id === "string" && SESSION_ID.test(id) && store.deleteOwned(id, userOf(req).uid);
  req.log.info({ existed, sessions: store.size }, "session delete requested");
  res.status(204).end();
});

/** POST /api/sessions/:sessionId/document-map — the Document Map and Timeline for the session's document. */
router.post("/sessions/:sessionId/document-map", heavyBudget, admitAnalysis, async (req, res) => {
  const session = findSession(req);
  const output = await prepare(
    session,
    "documentMap",
    async () => {
      const started = performance.now();
      const held = documentOf(session);
      const analysis = await analyzeDocument(held.document, modelOptions(req, session));
      // Statuses and counts only: no text from the document or the model.
      req.log.info(
        {
          kind: held.document.kind,
          stage: session.stage,
          documentType: session.documentType ?? null,
          paragraphs: held.document.chunks.length,
          fields: Object.fromEntries(analysis.map.fields.map((field) => [field.id, field.status])),
          timeline: analysis.timeline.items.length,
          ms: Math.round(performance.now() - started),
        },
        "document map built",
      );
      return PrepareDocumentMapResponse.parse({
        document: describeDocument(held.document),
        chunks: analysis.chunks,
        map: analysis.map,
        timeline: analysis.timeline,
      });
    },
    complete.documentMap,
  );
  res.json(output);
});

/** POST /api/sessions/:sessionId/review-prompts — the Review Prompts for the session's document. */
router.post("/sessions/:sessionId/review-prompts", heavyBudget, admitAnalysis, async (req, res) => {
  const session = findSession(req);
  const output = await prepare(
    session,
    "reviewPrompts",
    async () => {
      const started = performance.now();
      const held = documentOf(session);
      const { chunks, review } = await analyzeReviewPrompts(held.document, modelOptions(req, session));
      req.log.info(
        {
          kind: held.document.kind,
          stage: session.stage,
          documentType: session.documentType ?? null,
          paragraphs: held.document.chunks.length,
          prompts: review.prompts.length,
          phrasedBy: {
            model: review.prompts.filter((prompt) => prompt.phrasedBy === "model").length,
            template: review.prompts.filter((prompt) => prompt.phrasedBy === "template").length,
          },
          notFound: review.notFound.length,
          withheld: review.withheld,
          ms: Math.round(performance.now() - started),
        },
        "review prompts built",
      );
      return PrepareReviewPromptsResponse.parse({ document: describeDocument(held.document), chunks, ...review });
    },
    complete.reviewPrompts,
  );
  res.json(output);
});

/**
 * POST /api/sessions/:sessionId/compare — the change cards between the
 * session's two versions. Alignment, diff and classification are
 * deterministic and run on the request thread, bounded by the alignment's
 * paragraph-pair cap (past it: 422, before any table is allocated).
 */
router.post("/sessions/:sessionId/compare", heavyBudget, admitAnalysis, async (req, res) => {
  const session = findSession(req);
  const output = await prepare(
    session,
    "compare",
    async () => {
      const started = performance.now();
      const olderHeld = session.documents.find((entry) => entry.slot === "older");
      const newerHeld = session.documents.find((entry) => entry.slot === "newer");
      if (!olderHeld || !newerHeld) {
        throw new ApiError(400, "not-a-comparison", "This session holds one document. Change cards need the two versions of a compare-versions session.");
      }
      const older = toSourceChunks(olderHeld.document);
      const newer = toSourceChunks(newerHeld.document);
      let comparison;
      try {
        comparison = compareDocuments(older, newer);
      } catch (error) {
        if (!(error instanceof AlignmentTooLargeError)) throw error;
        throw new ApiError(
          422,
          "too-complex",
          `These versions have too many paragraphs to line up (${error.older} and ${error.newer}). Up to about 2,000 paragraphs a side can be compared.`,
          { cause: error },
        );
      }
      // Counts only: no text from either document.
      req.log.info(
        {
          kinds: { older: olderHeld.document.kind, newer: newerHeld.document.kind },
          paragraphs: { older: older.length, newer: newer.length },
          aligned: comparison.aligned,
          unchanged: comparison.unchanged,
          changes: comparison.changes.length,
          byKind: comparison.byKind,
          status: {
            changed: comparison.changes.filter((change) => change.status === "changed").length,
            added: comparison.changes.filter((change) => change.status === "added").length,
            removed: comparison.changes.filter((change) => change.status === "removed").length,
          },
          ms: Math.round(performance.now() - started),
        },
        "versions compared",
      );
      return PrepareComparisonResponse.parse({
        older: { document: describeDocument(olderHeld.document), chunks: older },
        newer: { document: describeDocument(newerHeld.document), chunks: newer },
        ...comparison,
      });
    },
    complete.compare,
  );
  res.json(output);
});

export default router;
