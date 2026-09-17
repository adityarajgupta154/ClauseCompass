import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getSessionStore } from "../sessions";

const router: IRouter = Router();

/**
 * One store check at a time per instance: the route is open, so calls that
 * arrive while a check is in flight share its answer rather than each
 * sending the database a command, and a flood of health checks costs the
 * database one command per round trip. Nothing is remembered between
 * checks; the next call after an answer asks again.
 */
let check: Promise<void> | undefined;

function storeAnswers(): Promise<void> {
  check ??= getSessionStore()
    .size()
    .then(() => undefined)
    .finally(() => {
      check = undefined;
    });
  return check;
}

/**
 * Open, and a fact about the whole service rather than the process: the
 * session store is asked for its count, so a database that cannot be
 * reached, or refuses this instance, shows here as the same 503
 * store-unavailable the session routes would answer, before anyone has
 * uploaded a document to find out.
 */
router.get("/healthz", async (_req, res, next) => {
  try {
    await storeAnswers();
  } catch (error) {
    next(error);
    return;
  }
  res.json(HealthCheckResponse.parse({ status: "ok" }));
});

export default router;
