import { authClient } from "@/features/auth/auth-client";

/**
 * The web app's sign-in for the suites that mount the journey: the routes
 * from the upload on need a signed-in reader, and the API they call needs
 * the bearer token the same client hands out. vitest runs the app with
 * VITE_AUTH_PROVIDER=mock (vitest.config.ts), so the one client the app
 * installs is the offline stand-in; signing it in here signs in every
 * request the screens make.
 */
export async function signInTestReader(): Promise<void> {
  if (authClient.name !== "mock") {
    throw new Error("the suites need the web app's mock sign-in; run them through `pnpm test` (VITE_AUTH_PROVIDER=mock)");
  }
  await authClient.signInWithGoogle();
}

export async function signOutTestReader(): Promise<void> {
  await authClient.signOut();
}
