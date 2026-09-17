import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { copy } from "@/features/journey/copy";

/**
 * Whether the loading line is on screen (a screen's code is being fetched),
 * and whether a route change arrived while it was: React keeps the old
 * screen in the document, hidden, until the new one is ready, so a focus
 * placed then would land on a heading nobody can see. The change waits, and
 * the focus goes when the line leaves (ScreenLoading).
 */
let loadingShown = false;
let awaitingScreen = false;

/**
 * Puts keyboard and screen-reader focus on the screen now showing: its one
 * h1 (the main landmark if a screen has none), which announces the screen
 * and starts reading from its top. Nothing happens when something already
 * holds focus, so a screen that places focus itself on arrival (the safety
 * screen's heading, a confirmation notice) keeps its choice.
 */
export function focusScreen() {
  if (loadingShown) {
    awaitingScreen = true;
    return;
  }
  const active = document.activeElement;
  if (active !== null && active !== document.body) return;
  // Every screen has one h1 (the welcome screen's sits in its header, above main); the main landmark is the fallback.
  const target = document.querySelector<HTMLElement>("h1") ?? document.getElementById("main");
  if (target === null) return;
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

/**
 * Where focus goes when the route changes. The control that was activated
 * leaves the tree with the old screen, so focus would fall to the document
 * body: the reader hears nothing, and Tab starts from the very top. The
 * first render is the page load, where the browser's own start position is
 * right, so only a change of location acts (a repeated effect for the same
 * location, as under StrictMode, does nothing).
 */
export function RouteFocus() {
  const [location] = useLocation();
  const previous = useRef(location);
  useEffect(() => {
    if (previous.current === location) return;
    previous.current = location;
    focusScreen();
  }, [location]);
  return null;
}

/**
 * The line shown while a screen's code is fetched (the Suspense fallback in
 * App.tsx). Its effect runs before RouteFocus's in the same commit (it comes
 * first in the tree), so a route change knows the line is showing; it leaves
 * in the commit that mounts the screen, so its cleanup runs with the screen's
 * heading in place, and a route change that was waiting gets its focus then.
 * On a first load nothing was waiting, and the browser's start position stands.
 */
export function ScreenLoading() {
  useEffect(() => {
    loadingShown = true;
    return () => {
      loadingShown = false;
      if (!awaitingScreen) return;
      awaitingScreen = false;
      focusScreen();
    };
  }, []);
  return (
    <p role="status" className="px-6 py-14 text-center text-lg text-muted-foreground" data-testid="status-screen-loading">
      {copy.loadingScreen}
    </p>
  );
}
