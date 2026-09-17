import { type ReactNode } from "react";
import { Redirect, useLocation } from "wouter";
import { useAuth } from "./auth-context";

/**
 * Gate for the document journey: the upload and every screen after it need
 * a signed-in reader, because the API opens a session for one reader and
 * shows it to nobody else. A signed-out visitor goes to the sign-in screen
 * and comes back to the screen they were heading for (`next`). While the
 * persisted sign-in is still being restored nothing renders, so a reader
 * who is signed in is not sent away for the moment it takes to know.
 */

/** The screens sign-in may return to: the gated ones, and no address a link could smuggle in. */
export const GATED_PATHS = ["/upload", "/interview", "/map", "/review", "/compare", "/packet"] as const;

export type GatedPath = (typeof GATED_PATHS)[number];

export function isGatedPath(value: string | null | undefined): value is GatedPath {
  return typeof value === "string" && (GATED_PATHS as readonly string[]).includes(value);
}

/** Where sign-in returns to: the `next` the screen was given if it is one of ours, else the upload screen. */
export function nextPathFrom(search: string): GatedPath {
  const next = new URLSearchParams(search).get("next");
  return isGatedPath(next) ? next : "/upload";
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const [location] = useLocation();
  if (state.status === "loading") return null;
  if (state.status === "signed-out") {
    const next = isGatedPath(location) ? `?next=${encodeURIComponent(location)}` : "";
    return <Redirect to={`/sign-in${next}`} replace />;
  }
  return <>{children}</>;
}
