import type { ComponentType } from "react";

/**
 * The screens after the welcome, each built into its own file and fetched
 * when first shown, so the first paint carries the welcome screen's code and
 * nothing of the journey's. The safety screen and the not-found screen are
 * not here on purpose: they ship with the welcome, so an escalation never
 * waits on a network fetch.
 *
 * Each screen remembers its component once the code has arrived, and
 * App.tsx renders a remembered screen at once instead of suspending: React
 * holds a Suspense boundary's content back for a moment after showing its
 * fallback, so suspending on code that is already here would put the loading
 * line, and a delay, in front of every route change.
 */
export interface Screen {
  /** Fetches the screen's code for showing it; every call returns the same promise until one fails. */
  load(): Promise<ScreenModule>;
  /** Fetches the screen's code ahead of need; a failure is dropped, and the next load tries again. */
  prefetch(): Promise<void>;
  /** The component when its code has arrived, null before. */
  peek(): ComponentType | null;
}

interface ScreenModule {
  default: ComponentType;
}

export const screens = {
  upload: screen(() => import("@/pages/upload")),
  interview: screen(() => import("@/pages/interview")),
  map: screen(() => import("@/pages/document-map")),
  review: screen(() => import("@/pages/review-prompts")),
  compare: screen(() => import("@/pages/compare")),
  packet: screen(() => import("@/pages/packet")),
  ask: screen(() => import("@/pages/ask")),
  help: screen(() => import("@/pages/official-help")),
  signIn: screen(() => import("@/pages/sign-in")),
} satisfies Record<string, Screen>;

/**
 * Fetches every screen's code. Tests that mount the routes await it first,
 * so a screen renders on the mount rather than after a loading line; the app
 * itself fetches only the next screen through App.tsx.
 */
export function preloadScreens(): Promise<void> {
  return Promise.all(Object.values(screens).map((entry) => entry.prefetch())).then(() => undefined);
}

/**
 * A fetch that fails when the screen is wanted reloads the page once: after
 * a new build is published, a tab opened before it still names the old
 * files, which are gone, and a fresh load is the fix; a failure that
 * survives the reload is thrown, and reaches the error boundary like any
 * other. A prefetch that fails does nothing of the kind: it was not asked
 * for, and a reload would take a screen away from a reader using it.
 *
 * The promise handed to a render is kept, its rejection included: React
 * reads a promise's outcome from the object it was given, so a render must
 * be given the same one until it has read the outcome (a rejected one is
 * then the error boundary's, as a React.lazy rejection would be).
 */
function screen(fetchModule: () => Promise<ScreenModule>): Screen {
  let component: ComponentType | null = null;
  let pending: Promise<ScreenModule> | null = null;
  let wanted: Promise<ScreenModule> | null = null;
  const fetchOnce = () =>
    (pending ??= fetchModule().then(
      (module) => {
        component = module.default;
        markLoaded();
        return module;
      },
      (error: unknown) => {
        pending = null;
        throw error;
      },
    ));
  return {
    load() {
      wanted ??= fetchOnce().catch((error: unknown) => {
        if (reloadOnce()) return new Promise<never>(() => {});
        throw error;
      });
      return wanted;
    },
    prefetch() {
      return fetchOnce().then(
        () => undefined,
        () => undefined,
      );
    },
    peek: () => component,
  };
}

const RELOADED_KEY = "clausecompass.reloaded-for-screen";

function reloadOnce(): boolean {
  try {
    if (sessionStorage.getItem(RELOADED_KEY) !== null) return false;
    sessionStorage.setItem(RELOADED_KEY, "1");
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** A screen that arrived proves the files are current again, so a later stale tab may reload once more. */
function markLoaded() {
  try {
    sessionStorage.removeItem(RELOADED_KEY);
  } catch {
    // No storage: nothing was recorded either.
  }
}
