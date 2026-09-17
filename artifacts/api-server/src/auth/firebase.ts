import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload } from "jose";
import { AuthError, isUid, type AuthenticatedUser, type AuthVerifier } from "./verifier";

/**
 * Checks Firebase Authentication ID tokens the way Firebase documents it
 * (Verify ID tokens using a third-party JWT library): RS256, signed by one of
 * the keys Google publishes for the securetoken service, issued for this
 * project (`iss`, `aud`), not yet expired, with the uid in `sub`. Only the
 * public keys are needed, so no service account is held anywhere on this
 * server. jose caches the key set and refreshes it when a token names a key
 * it has not seen, which covers Google's key rotation.
 */

/** Google's public keys for Firebase ID tokens, as a JSON Web Key Set. */
export const FIREBASE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

export interface FirebaseVerifierOptions {
  projectId: string;
  /** Where to fetch the signing keys; the tests point this at a local server holding a key they generated. */
  jwksUrl?: string;
  /** How long a key fetch may take before the token is reported as uncheckable, in ms. */
  fetchTimeoutMs?: number;
}

const DEFAULT_FETCH_TIMEOUT_MS = 5_000;

/** Firebase also puts the uid in `user_id`; `sub` is the standard claim and the one the documentation says to read. */
function uidOf(payload: JWTPayload): string {
  const uid = payload.sub;
  if (!isUid(uid)) throw new AuthError("invalid", "the token's subject is not a user id");
  return uid;
}

/** A failure to reach or read the key set says nothing about the token; a failed check does. */
function classify(error: unknown): AuthError {
  if (error instanceof errors.JWKSTimeout) {
    return new AuthError("unavailable", "the signing keys could not be fetched in time", { cause: error });
  }
  if (error instanceof errors.JOSEError && error.code === "ERR_JOSE_GENERIC" && error.message.includes("JSON Web Key Set")) {
    return new AuthError("unavailable", "the signing keys could not be read", { cause: error });
  }
  if (error instanceof errors.JOSEError) {
    return new AuthError("invalid", error.message, { cause: error });
  }
  // fetch() rejects with a TypeError when the key server could not be reached at all.
  if (error instanceof TypeError) {
    return new AuthError("unavailable", "the signing keys could not be fetched", { cause: error });
  }
  return new AuthError("unavailable", "the token could not be checked", { cause: error });
}

/** How far ahead of this server a token's clock may be before it is refused. */
const CLOCK_SKEW_SECONDS = 300;

export function createFirebaseVerifier(options: FirebaseVerifierOptions): AuthVerifier {
  const { projectId } = options;
  const jwks = createRemoteJWKSet(new URL(options.jwksUrl ?? FIREBASE_JWKS_URL), {
    timeoutDuration: options.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS,
  });
  const issuer = `https://securetoken.google.com/${projectId}`;

  return {
    name: "firebase",
    async verify(token: string): Promise<AuthenticatedUser> {
      let payload: JWTPayload;
      try {
        ({ payload } = await jwtVerify(token, jwks, {
          algorithms: ["RS256"],
          issuer,
          audience: projectId,
          // Firebase sets every one of these; a token missing any is not one of theirs.
          requiredClaims: ["exp", "iat", "sub", "auth_time"],
        }));
      } catch (error) {
        throw classify(error);
      }
      // Firebase's own checks that jose does not make: issued and signed in no later than now (five minutes of clock skew allowed). jose has already made sure iat is a number.
      const latest = Date.now() / 1000 + CLOCK_SKEW_SECONDS;
      if ((payload.iat as number) > latest) throw new AuthError("invalid", "the token's iat is in the future");
      const authTime = payload.auth_time;
      if (typeof authTime !== "number" || authTime > latest) {
        throw new AuthError("invalid", "the token's auth_time is missing, not a time, or in the future");
      }
      return { uid: uidOf(payload) };
    },
  };
}
