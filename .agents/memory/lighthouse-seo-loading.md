---
name: Lighthouse, SEO head and screen loading
description: Why the dev-proxy Lighthouse numbers are not the product's, what React does around a Suspense fallback (throttle, hidden old screen), and the deliberate limits of the code split and the head pipeline.
---

## Measure the production build, not the dev proxy
The Replit dev proxy adds `x-robots-tag: noindex` (SEO fails) and Vite dev injects scripts before `<meta charset>` (Best Practices fails); neither exists in a build. Measure with `lighthouse@12` via npx against `vite preview` of a prod build, `CHROME_PATH=/repl/tools/bin/chromium`, flags `--headless=new --no-sandbox --disable-gpu`. Mobile varies ±2 points run to run on this container (TBT noise).
**How to apply:** when the user pastes scores from the preview pane, reproduce on a prod build first; report environment causes separately from product causes.

## Suspense facts that shaped the code split
- React holds a Suspense boundary's content back ~300 ms after it has shown the fallback (fallback throttle). `React.lazy` suspends on the first render even when the module was prefetched, so every route change paid the line + 300 ms. Hence `screens.ts` remembers the component and `lazyScreen` renders it synchronously; `use()` only when the code is not here.
- While the fallback shows, React keeps the old screen in the DOM with `display:none`; a focus placed then lands on a hidden heading. Route-change focus must wait for the fallback's cleanup (module flags in route-focus.tsx). In happy-dom a hidden focused element keeps focus (no fixup), so tests must not assert `activeElement === body` there.
- React reads a thenable's outcome from the object it was given: `use()` needs the same promise across the suspend→retry pair, rejection included (a fresh promise per render loops on failure). A cached rejection stays until reload, as with `React.lazy` before.
- `nohup … &` dies with the ShellExec call; run servers with run_in_background.
**Why:** `pnpm a11y` reported focus on body for every lazy screen after the first split; the probe showed the line for 250–750 ms even with code prefetched.

## Deliberate limits (do not "fix" without a reason)
- `@workspace/rules` + zod stay in the main chunk: `journey-context.tsx` transitions synchronously through the safety flow, so they cannot wait on a fetch. Both copy tables are eager too (language switch must be instant).
- Prefetch 2.5 s after `load`: outside Lighthouse's LCP window (observed ~2.76 s in the trace); a failed prefetch never reloads the page, only a wanted screen's failed fetch does (once, key cleared by the next arrival).
- Hero srcSet ignores DPR 1.75 on purpose (Lighthouse's image insight still flags 640w); decorative margin/footer images are sized for 2× and lazy.
- Only `/` and `/help` are indexable, both one segment deep; `document-head.tsx` derives the site root from the canonical's last slash, so a nested indexable route would need a different derivation.
- The published app is served by `vite preview`, so the plugin's preview middleware is the production edge: it is where `X-Robots-Tag` and the per-route `/help` head live. `.env` values reach the plugin only through `loadEnv` (Vite does not put them in `process.env`).
- `check:size` was already over its 3 MiB ceiling at HEAD before this work (~3.35 MB, decorations); this task added ~250 KB of images. Not bumped; the user decides.
