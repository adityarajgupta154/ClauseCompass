---
name: Accessibility verification in this environment
description: How the committed keyboard + axe audit (pnpm a11y) runs here, and the browser quirks that cost retries when writing it.
---
# The audit is a committed script, not a vitest suite

`pnpm a11y` (scripts/a11y/) drives the three keyboard-only journeys in the system Chromium (/repl/tools/bin/chromium via playwright-core, args --no-sandbox --disable-gpu) and runs axe light + dark on every screen state. It needs the web workflow plus the API started from a shell with the mock provider (never the workflow env) — start the API with ShellExec run_in_background, not with `&` (the process dies when the call returns; `pgrep -f dist/index.mjs` also matches the shell itself, so it lies about liveness).

**Why:** `pnpm test` must stay offline and browser-free (repo-size guard, no Playwright browsers); the system Chromium is the heavy part and is already there.

**How to apply:** run it after any change to a screen's controls or Tab order; 0 findings with all journeys complete is the bar. The runner exits 1 on critical/serious axe, unnamed or indicator-less controls, off-screen focus, or a journey dead end. Self-test the harness when its checks change by injecting a probe button (outline none / empty aria-label) through an init script and confirming it is flagged.

# Quirks the runner works around (each cost at least one retry)

- Sequential focus start point: `blur()` does not reset it; focus a temporary tabindex=-1 sentinel at the top of body and remove it (keyboard.mjs restartFromTop).
- Cycle detection must key elements by a per-element marker, not data-testid: testids repeat (one toggle per source card, one link per reference) and end the cycle early or produce false "not reachable".
- Focus indicator check: compare the element **and its three nearest ancestors** (a radio's ring is drawn on its label card) and ignore an outline whose style is none — Chromium still reports a changed outline-color on :focus-visible with outline none, a false "visible".
- axe-core 4.13 cannot parse the `oklch(... none)` colours Tailwind v4 emits for its neutral palette: the whole packet sheet comes back "incomplete" for color-contrast, which looks clean unless you count incomplete nodes. The runner recomputes contrast for those nodes with the browser parsing the colour through a canvas pixel.
- After toggling the dark class wait ~450 ms before axe.run, or transition-colors mid-flight yields phantom contrast failures. Dark mode is not user-reachable in the product (no toggle); dark scans are a guard on the tokens.
- axe reads a fading-in element's colour at its current opacity: a screen audited right after a navigation (welcome-after-delete) failed contrast on the hero's 700 ms entrance. The runner now waits for every finite animation (`document.getAnimations`, iterations ≠ Infinity, 2 s cap) before axe; the decorative loops are excluded because they never fade.
- The screenshot tool opens a fresh session so guarded routes redirect to /; screenshot guarded screens through the harness.
- `transition-all`, `transition-shadow`, or `box-shadow` in a `transition-[…]` list on a focusable element animates the ring's box-shadow, so the runner samples a near-zero ring right after focus and reports no-focus-indicator. Controls use `transition-colors` (or a list without box-shadow); keep shadow transitions for non-focusable cards only.
- A header pinned with `sticky` covers whatever focus scrolls under it; it is sticky from lg up only, with `scroll-padding-top` on html at that width. On a phone the bar wraps to several rows and is left static.

# Design decisions the audit enforces

- Route changes focus the new screen's h1 (RouteFocus) unless the screen placed focus itself; the audit prints "focus after navigation" per screen so a regression to "body" is visible.
- The packet's ~130 reference links stay real links (they move focus to the excerpt) but a visible-on-focus bypass link before the sheet reaches the footer in one Tab.
