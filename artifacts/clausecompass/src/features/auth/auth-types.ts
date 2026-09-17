/**
 * The shape of the reader's sign-in as the screens see it, and what can go
 * wrong with it. Kept apart from auth-client.ts, which selects and installs
 * the one client at import time, so the offline stand-in and the tests can
 * import these without that side effect.
 */

export interface AuthUser {
  uid: string;
  /** As the identity provider has it; null for an e-mail account that never set one. */
  displayName: string | null;
  email: string | null;
}

export type AuthState =
  /** The persisted sign-in is still being restored; nothing should decide on it yet. */
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; user: AuthUser };

/** What went wrong with a sign-in, in terms the screen has a sentence for (copy.auth.errors). */
export type SignInReason =
  | "popup-blocked"
  | "popup-closed"
  | "unauthorized-domain"
  | "provider-off"
  | "wrong-password"
  | "no-account"
  | "email-in-use"
  | "weak-password"
  | "bad-email"
  | "too-many"
  | "disabled"
  | "offline"
  /** This copy of the app has no Firebase web config; a deployment problem, not something the reader can fix. */
  | "not-configured"
  | "unknown";

export class SignInError extends Error {
  override readonly name = "SignInError";

  constructor(
    readonly reason: SignInReason,
    options?: { cause?: unknown },
  ) {
    super(`sign-in failed: ${reason}`, options?.cause === undefined ? undefined : { cause: options.cause });
  }
}

export interface AuthClient {
  readonly name: "firebase" | "mock";
  getState(): AuthState;
  /** Called on every change; the listener is not called for the current state on subscription. */
  subscribe(listener: () => void): () => void;
  /** The bearer token for the API, or null when nobody is signed in. Waits for the restore, so a request at boot is not sent without it. */
  getToken(): Promise<string | null>;
  signInWithGoogle(): Promise<void>;
  signInWithEmail(email: string, password: string): Promise<void>;
  createAccount(email: string, password: string): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  signOut(): Promise<void>;
  /**
   * Start loading whatever signing in needs, ahead of the first press. For
   * the sign-in screen: the first button answers sooner, and a sign-in the
   * browser still holds without this client's own record of it is found and
   * reported through the state, so that reader is sent on instead of asked
   * again. Never rejects; a failed load is reported by the sign-in itself.
   */
  prepare(): void;
}
