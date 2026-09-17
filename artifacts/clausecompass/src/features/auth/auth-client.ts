import { setAuthTokenGetter } from "@workspace/api-client-react";
import { createFirebaseAuthClient } from "./auth-firebase";
import { createMockAuthClient } from "./auth-mock";
import type { AuthClient } from "./auth-types";

/**
 * Who the reader is, for the API (PRD §9: a document is opened for the
 * reader who uploaded it and shown to nobody else). The screens see one
 * small interface; behind it is Firebase Authentication in real use, or an
 * offline stand-in (VITE_AUTH_PROVIDER=mock) for the test suite and the
 * accessibility run, which cannot reach Google. The API is told who is
 * asking through the bearer token attached to every request.
 */

export { SignInError, type AuthClient, type AuthState, type AuthUser, type SignInReason } from "./auth-types";

function selectAuthClient(): AuthClient {
  if (import.meta.env.VITE_AUTH_PROVIDER === "mock") {
    // Same rule as the API's AUTH_PROVIDER=mock: a build meant for readers never runs on a stand-in.
    if (import.meta.env.PROD) throw new Error("VITE_AUTH_PROVIDER=mock is not allowed in a production build");
    return createMockAuthClient();
  }
  return createFirebaseAuthClient();
}

export const authClient: AuthClient = selectAuthClient();

// Installed at module load, before any screen or provider effect can send a request (the journey's boot-time cleanup of a stale session is one).
setAuthTokenGetter(() => authClient.getToken());
