import { useEffect, useSyncExternalStore } from "react";

/**
 * A screen's own tab title, for the one screen whose heading changes without
 * the route changing: the sign-in screen, whose form is set to sign in, to
 * create an account or to send a password reset. The head component reads
 * the route's title (document-head.tsx); a screen that says something else
 * for a while sets it here, and takes it back when it changes again or
 * leaves the page. One screen at a time, like the route itself.
 */

let title: string | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(next: string | null) {
  if (next === title) return;
  title = next;
  for (const listener of listeners) listener();
}

/** Sets the screen's title for as long as the screen shows it; `null` leaves the route's own. */
export function useScreenTitle(screenTitle: string | null) {
  useEffect(() => {
    publish(screenTitle);
    return () => publish(null);
  }, [screenTitle]);
}

/** The title the screen set, or `null` when the route's own stands. */
export function useSetScreenTitle(): string | null {
  return useSyncExternalStore(subscribe, () => title, () => null);
}
