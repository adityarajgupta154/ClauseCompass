import type { RequestHandler } from "express";
import { getConfig } from "../lib/config";
import { admitThrough, Gate } from "./extraction-gate";
import { RateLimiter, rateLimit } from "./rate-limit";

/**
 * The process-wide budgets every route shares, sized from the environment
 * once at import (config is validated before this module loads, see
 * index.ts). Two per-client budgets and one shared gate:
 *
 * - `generalBudget` charges every /api request (RATE_LIMIT_PER_MINUTE).
 * - `heavyBudget` also charges the routes that cost a parser or a model —
 *   uploads and the three analyses (RATE_LIMIT_HEAVY_PER_MINUTE).
 * - `analysisGate` bounds how many analyses run at once in the whole
 *   process, whoever asks: past its slots requests wait in a short queue,
 *   past the queue they get 503 busy. A Document Map fans out to six model
 *   calls, so this is what keeps a burst of readers from turning into an
 *   unbounded number of calls (see also llm/concurrency.ts, which caps the
 *   calls themselves).
 */

const { rateLimit: budgets } = getConfig();

export const generalLimiter = new RateLimiter({ perMinute: budgets.perMinute });
export const heavyLimiter = new RateLimiter({ perMinute: budgets.heavyPerMinute });

export const generalBudget: RequestHandler = rateLimit(generalLimiter);
export const heavyBudget: RequestHandler = rateLimit(heavyLimiter);

/** Analyses in flight at once, and how many may wait behind them. */
export const MAX_CONCURRENT_ANALYSES = 4;
export const MAX_WAITING_ANALYSES = 16;

export const analysisGate = new Gate(MAX_CONCURRENT_ANALYSES, MAX_WAITING_ANALYSES);

/** A place in the analysis gate, taken after the per-client budget on every model-backed route. */
export const admitAnalysis: RequestHandler = admitThrough(analysisGate);
