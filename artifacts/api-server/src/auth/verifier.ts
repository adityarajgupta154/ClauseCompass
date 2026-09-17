/**
 * What the server knows about the reader once a request's bearer token has
 * been checked: the identity provider's stable id for them, and nothing
 * else. No name, no e-mail, no profile is read from the token, because the
 * server needs only to tell one reader's sessions from another's.
 */
export interface AuthenticatedUser {
  readonly uid: string;
}

export type AuthErrorKind =
  /** The token is not one this server accepts: malformed, forged, expired, or issued for another project. */
  | "invalid"
  /** The token could not be checked at all (the signing keys could not be fetched); the reader may be fine. */
  | "unavailable";

export class AuthError extends Error {
  override readonly name = "AuthError";

  constructor(
    readonly kind: AuthErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
  }
}

export interface AuthVerifier {
  readonly name: string;
  /** Resolves the reader behind a bearer token; rejects with AuthError for anything else. */
  verify(token: string): Promise<AuthenticatedUser>;
}

/** Firebase caps a uid at 128 characters; anything outside this shape is refused before it reaches a lookup. */
const UID = /^[A-Za-z0-9_.:@-]{1,128}$/;

export function isUid(value: unknown): value is string {
  return typeof value === "string" && UID.test(value);
}
