import { AuthError, isUid, type AuthenticatedUser, type AuthVerifier } from "./verifier";

/**
 * Offline stand-in for Firebase (AUTH_PROVIDER=mock, refused in production):
 * a bearer token of the form `mock:<uid>` names the reader outright. The
 * test suite and the accessibility run use it; the web app's own mock
 * sign-in (VITE_AUTH_PROVIDER=mock) mints the same tokens.
 */

export const MOCK_TOKEN_PREFIX = "mock:";

export function createMockVerifier(): AuthVerifier {
  return {
    name: "mock",
    async verify(token: string): Promise<AuthenticatedUser> {
      if (!token.startsWith(MOCK_TOKEN_PREFIX)) throw new AuthError("invalid", "not a mock token");
      const uid = token.slice(MOCK_TOKEN_PREFIX.length);
      if (!isUid(uid)) throw new AuthError("invalid", "the mock token does not name a user id");
      return { uid };
    },
  };
}
