import type { Auth, User } from "firebase/auth";
import { SignInError, type AuthClient, type AuthState, type AuthUser, type SignInReason } from "./auth-types";

/**
 * Firebase Authentication behind the AuthClient interface. The SDK is
 * loaded on demand: a browser that has never signed in here starts as
 * signed-out without downloading it, and fetches it when the reader opens
 * the sign-in screen. A browser that has signed in (the hint below) loads
 * it at boot to restore the sign-in Firebase persisted, and reports
 * "loading" until that restore has settled.
 *
 * The web config (VITE_FIREBASE_*) identifies the project; it is not a
 * secret (it ships in this bundle), and the project's own rules — which
 * sign-in methods are on, which domains may use them — are set in the
 * Firebase console, not here.
 */

/** Set while a reader is signed in on this browser; only decides whether the SDK loads at boot. */
const HINT_KEY = "clausecompass.auth.hint.v1";

const CONFIG_VARS = {
  apiKey: "VITE_FIREBASE_API_KEY",
  authDomain: "VITE_FIREBASE_AUTH_DOMAIN",
  projectId: "VITE_FIREBASE_PROJECT_ID",
  appId: "VITE_FIREBASE_APP_ID",
} as const;

type FirebaseConfig = Record<keyof typeof CONFIG_VARS, string>;

function readConfig(): FirebaseConfig {
  const env = import.meta.env as Record<string, unknown>;
  const config: Partial<FirebaseConfig> = {};
  const missing: string[] = [];
  for (const [key, variable] of Object.entries(CONFIG_VARS) as [keyof FirebaseConfig, string][]) {
    const value = env[variable];
    if (typeof value === "string" && value.trim() !== "") config[key] = value.trim();
    else missing.push(variable);
  }
  if (missing.length > 0) {
    throw new SignInError("not-configured", {
      cause: new Error(`ClauseCompass: Firebase sign-in is not configured; set ${missing.join(", ")} (see artifacts/clausecompass/.env.example).`),
    });
  }
  return config as FirebaseConfig;
}

function hasHint(): boolean {
  try {
    return window.localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
}

function setHint(present: boolean): void {
  try {
    if (present) window.localStorage.setItem(HINT_KEY, "1");
    else window.localStorage.removeItem(HINT_KEY);
  } catch {
    // Without storage the SDK simply loads on the next visit when the reader signs in again.
  }
}

/** The SDK's error codes, in terms the screen has a sentence for. */
const REASON_BY_CODE: Record<string, SignInReason> = {
  "auth/popup-blocked": "popup-blocked",
  "auth/popup-closed-by-user": "popup-closed",
  "auth/cancelled-popup-request": "popup-closed",
  "auth/unauthorized-domain": "unauthorized-domain",
  "auth/operation-not-allowed": "provider-off",
  "auth/wrong-password": "wrong-password",
  // Newer projects answer both a wrong password and an unknown e-mail with this one code, on purpose.
  "auth/invalid-credential": "wrong-password",
  "auth/invalid-login-credentials": "wrong-password",
  "auth/user-not-found": "no-account",
  "auth/email-already-in-use": "email-in-use",
  "auth/weak-password": "weak-password",
  "auth/invalid-email": "bad-email",
  "auth/missing-email": "bad-email",
  "auth/missing-password": "wrong-password",
  "auth/too-many-requests": "too-many",
  "auth/user-disabled": "disabled",
  "auth/network-request-failed": "offline",
};

function toSignInError(error: unknown): SignInError {
  if (error instanceof SignInError) return error;
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  const reason = typeof code === "string" ? REASON_BY_CODE[code] : undefined;
  return new SignInError(reason ?? "unknown", { cause: error });
}

function toAuthUser(user: User): AuthUser {
  return { uid: user.uid, displayName: user.displayName, email: user.email };
}

export function createFirebaseAuthClient(): AuthClient {
  let state: AuthState = hasHint() ? { status: "loading" } : { status: "signed-out" };
  const listeners = new Set<() => void>();
  let loading: Promise<Auth> | null = null;

  function setState(next: AuthState): void {
    state = next;
    for (const listener of listeners) listener();
  }

  /** Loads the SDK once and starts following its user; resolves once the persisted sign-in has been restored. */
  function auth(): Promise<Auth> {
    loading ??= (async () => {
      const config = readConfig();
      const [{ initializeApp }, sdk] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
      const instance = sdk.getAuth(initializeApp(config));
      sdk.onAuthStateChanged(instance, (user) => {
        setHint(user !== null);
        setState(user === null ? { status: "signed-out" } : { status: "signed-in", user: toAuthUser(user) });
      });
      await instance.authStateReady();
      return instance;
    })().catch((error: unknown) => {
      // A failed load is not a sign-out; the next call tries again, and the screens keep the last known state.
      loading = null;
      if (state.status === "loading") setState({ status: "signed-out" });
      throw error;
    });
    return loading;
  }

  if (state.status === "loading") void auth().catch(() => undefined);

  async function attempt(run: (sdk: typeof import("firebase/auth"), instance: Auth) => Promise<unknown>): Promise<void> {
    try {
      const instance = await auth();
      const sdk = await import("firebase/auth");
      await run(sdk, instance);
    } catch (error) {
      throw toSignInError(error);
    }
  }

  return {
    name: "firebase",
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async getToken() {
      if (state.status === "signed-out" && loading === null) return null;
      const instance = await auth();
      const user = instance.currentUser;
      // The SDK refreshes an expired token itself before answering.
      return user === null ? null : user.getIdToken();
    },
    signInWithGoogle: () =>
      attempt(async (sdk, instance) => {
        const provider = new sdk.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        await sdk.signInWithPopup(instance, provider);
      }),
    signInWithEmail: (email, password) => attempt((sdk, instance) => sdk.signInWithEmailAndPassword(instance, email, password)),
    createAccount: (email, password) => attempt((sdk, instance) => sdk.createUserWithEmailAndPassword(instance, email, password)),
    sendPasswordReset: (email) => attempt((sdk, instance) => sdk.sendPasswordResetEmail(instance, email)),
    async signOut() {
      if (state.status === "signed-out" && loading === null) return;
      const instance = await auth();
      const sdk = await import("firebase/auth");
      await sdk.signOut(instance);
    },
    prepare() {
      void auth().catch(() => undefined);
    },
  };
}
