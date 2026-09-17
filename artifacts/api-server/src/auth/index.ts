import type { Request, RequestHandler } from "express";
import { getConfig, type Config } from "../lib/config";
import { ApiError } from "../middlewares/api-error";
import { createFirebaseVerifier } from "./firebase";
import { createMockVerifier } from "./mock";
import { AuthError, type AuthenticatedUser, type AuthVerifier } from "./verifier";

/**
 * Who is asking (PRD §9 keeps one reader's document to that reader). Every
 * route that opens, reads, prepares or ends a session runs behind
 * requireUser, which turns the request's bearer token into the reader's uid;
 * the session store binds each session to the uid that opened it, and the
 * routes answer another reader's request for it as if it did not exist.
 */

export function createAuthVerifier(auth: Config["auth"]): AuthVerifier {
  return auth.provider === "firebase" ? createFirebaseVerifier({ projectId: auth.projectId }) : createMockVerifier();
}

let cached: AuthVerifier | undefined;

/** The process-wide verifier for the configured AUTH_PROVIDER. */
export function getAuthVerifier(): AuthVerifier {
  cached ??= createAuthVerifier(getConfig().auth);
  return cached;
}

const users = new WeakMap<Request, AuthenticatedUser>();

/** The reader requireUser admitted; throws for a request that never passed it, which is a routing mistake, not a client error. */
export function userOf(req: Request): AuthenticatedUser {
  const user = users.get(req);
  if (!user) throw new Error("userOf() called on a request that did not pass requireUser");
  return user;
}

const BEARER = /^Bearer\s+(\S+)$/i;

/** The bearer token of the request, or null when the header is missing or is not a bearer credential. */
function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header !== "string") return null;
  const match = BEARER.exec(header.trim());
  return match ? match[1]! : null;
}

/**
 * Admits a request that carries a valid sign-in token and remembers the
 * reader for userOf(); answers 401 otherwise (the browser's session may
 * simply have ended, and the client sends the reader back to sign in), or
 * 503 when the token could not be checked at all.
 */
export const requireUser: RequestHandler = (req, res, next) => {
  const token = bearerToken(req);
  if (token === null) {
    res.set("WWW-Authenticate", "Bearer");
    next(new ApiError(401, "auth-required", "Sign in to continue. ClauseCompass opens a document only for a signed-in reader."));
    return;
  }
  getAuthVerifier()
    .verify(token)
    .then(
      (user) => {
        users.set(req, user);
        next();
      },
      (error: unknown) => {
        if (error instanceof AuthError && error.kind === "invalid") {
          // The reason stays in the log: the client cannot act on it, and a forger learns nothing.
          req.log.info({ reason: error.message }, "sign-in token refused");
          res.set("WWW-Authenticate", 'Bearer error="invalid_token"');
          next(new ApiError(401, "auth-invalid", "Your sign-in is no longer valid here. Sign in again and try once more.", { cause: error }));
          return;
        }
        req.log.warn({ err: error }, "sign-in token could not be checked");
        res.set("Retry-After", "30");
        next(new ApiError(503, "auth-unavailable", "ClauseCompass could not confirm your sign-in just now. Try again in a moment.", { cause: error }));
      },
    );
};

export { AuthError, type AuthenticatedUser, type AuthErrorKind, type AuthVerifier } from "./verifier";
export { FIREBASE_JWKS_URL, createFirebaseVerifier, type FirebaseVerifierOptions } from "./firebase";
export { MOCK_TOKEN_PREFIX, createMockVerifier } from "./mock";
