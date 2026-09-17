import { SignInError, type AuthClient, type AuthState, type AuthUser } from "./auth-types";

/**
 * Offline stand-in for Firebase (VITE_AUTH_PROVIDER=mock; refused in a
 * production build by auth-client.ts). Every sign-in succeeds at once with
 * a made-up reader, the sign-in lives in this tab's sessionStorage, and the
 * bearer token is `mock:<uid>`, which the API's AUTH_PROVIDER=mock accepts.
 * The test suite and the accessibility run drive the real screens through
 * it; a few inputs fail on purpose so the error paths can be exercised.
 */

export const MOCK_STORAGE_KEY = "clausecompass.auth.mock.v1";

/** The reader the Google button signs in. */
export const MOCK_GOOGLE_USER: AuthUser = { uid: "mock-google-reader", displayName: "Asha Verma", email: "asha.verma@example.com" };

/** A password that fails as a wrong password would, and an e-mail that fails as an unknown account would. */
export const MOCK_WRONG_PASSWORD = "wrong-password";
export const MOCK_UNKNOWN_EMAIL = "nobody@example.com";
export const MOCK_TAKEN_EMAIL = "taken@example.com";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readStored(): AuthUser | null {
  try {
    const raw = window.sessionStorage.getItem(MOCK_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<AuthUser>;
    if (typeof parsed.uid !== "string" || parsed.uid === "") return null;
    return {
      uid: parsed.uid,
      displayName: typeof parsed.displayName === "string" ? parsed.displayName : null,
      email: typeof parsed.email === "string" ? parsed.email : null,
    };
  } catch {
    return null;
  }
}

function writeStored(user: AuthUser | null): void {
  try {
    if (user === null) window.sessionStorage.removeItem(MOCK_STORAGE_KEY);
    else window.sessionStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(user));
  } catch {
    // Without storage the sign-in lasts as long as the page does; enough for a test.
  }
}

/** A stable uid for an e-mail, in the shape the API accepts. */
function uidFor(email: string): string {
  return `mock-${email.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`.slice(0, 128);
}

function checkEmail(email: string): void {
  if (!EMAIL.test(email)) throw new SignInError("bad-email");
}

export function createMockAuthClient(): AuthClient {
  let user: AuthUser | null = readStored();
  const stateOf = (): AuthState => (user === null ? { status: "signed-out" } : { status: "signed-in", user });
  // getState must return the same object while nothing changed, or useSyncExternalStore re-renders without end.
  let state = stateOf();
  const listeners = new Set<() => void>();

  function setUser(next: AuthUser | null): void {
    user = next;
    state = stateOf();
    writeStored(next);
    for (const listener of listeners) listener();
  }

  return {
    name: "mock",
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getToken: async () => (user === null ? null : `mock:${user.uid}`),
    async signInWithGoogle() {
      setUser(MOCK_GOOGLE_USER);
    },
    async signInWithEmail(email, password) {
      checkEmail(email);
      if (email.toLowerCase() === MOCK_UNKNOWN_EMAIL) throw new SignInError("no-account");
      if (password === MOCK_WRONG_PASSWORD) throw new SignInError("wrong-password");
      setUser({ uid: uidFor(email), displayName: null, email });
    },
    async createAccount(email, password) {
      checkEmail(email);
      if (email.toLowerCase() === MOCK_TAKEN_EMAIL) throw new SignInError("email-in-use");
      if (password.length < 6) throw new SignInError("weak-password");
      setUser({ uid: uidFor(email), displayName: null, email });
    },
    async sendPasswordReset(email) {
      checkEmail(email);
    },
    async signOut() {
      setUser(null);
    },
    prepare() {
      // Nothing to load.
    },
  };
}
