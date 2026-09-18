import express, { type Express } from "express";
import compression from "compression";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { getConfig } from "./lib/config";
import { loggableUrl } from "./lib/log-url";
import { logger } from "./lib/logger";
import { apiErrorHandler, notFoundHandler } from "./middlewares/api-error";
import { generalBudget } from "./middlewares/budgets";

const app: Express = express();
const config = getConfig();

/**
 * The client address the per-client budgets are charged to. Off by default:
 * `req.ip` is then the socket's peer and X-Forwarded-For is ignored, so a
 * client cannot pick a fresh budget per request by forging it. Behind a
 * proxy the peer is the proxy, so every reader would share one budget;
 * TRUST_PROXY names how many hops (or which addresses) to believe, and on
 * Replit it is `true` because the platform's edge replaces whatever
 * forwarding header a client sends (artifact env). Nothing but the budget
 * key depends on this: sessions are bound to the signed-in reader, never
 * to an address, and the request log carries no address at all.
 */
app.set("trust proxy", config.trustProxy);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: loggableUrl(req.url),
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

/**
 * Response headers for a JSON API: no content sniffing, no framing, no
 * referrer, no cross-origin embedding, HSTS behind TLS. helmet's default CSP
 * is kept too — it costs nothing on JSON and covers any HTML a proxy might
 * ever serve from this origin by mistake.
 */
app.use(
  helmet({
    // Allow-listed origins fetch responses across origins; the same-origin default would let the browser drop them.
    crossOriginResourcePolicy: { policy: config.corsOrigins.length > 0 ? "cross-origin" : "same-origin" },
  }),
);

// Compress ordinary API responses before they reach the routes.
app.use(compression());

/**
 * Cross-origin access is off unless CORS_ORIGINS names the browser origins
 * that may call this API. The web app is served from the same origin as
 * /api (path routing on Replit, the Vite proxy locally), so the default
 * grants nothing, and no preflight is ever answered for an origin outside
 * the list.
 */
if (config.corsOrigins.length > 0) {
  app.use(
    cors({
      origin: config.corsOrigins,
      methods: ["GET", "POST", "DELETE"],
      allowedHeaders: ["Authorization", "Content-Type"],
      exposedHeaders: ["Retry-After"],
      maxAge: 600,
    }),
  );
}

// Every route is charged to its client before anything else is read.
app.use("/api", generalBudget);

/**
 * JSON bodies are small on this API (a stage, a document type, a question),
 * so the parser stops at 16 KiB; documents travel as multipart and have
 * their own byte cap in uploads/multipart.ts. No route takes a form-encoded
 * body, so none is parsed.
 */
app.use(express.json({ limit: "16kb" }));

app.use("/api", router);
app.use("/api", notFoundHandler);
// Last: every error raised on /api leaves as JSON, never as an HTML stack page.
app.use(apiErrorHandler);

export default app;
