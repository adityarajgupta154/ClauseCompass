---
name: Bilingual copy, text size, read-aloud
description: Why the language toggle is a read-time Proxy over two copy tables, what is deliberately never translated, and the speech-synthesis behaviours that only show up in real browsers.
---

# Language toggle = UI copy only

The toggle changes the product's own sentences. Model claims, review-prompt titles/whyItMatters (from the rule registry), document excerpts and the packet stay English, and the screen says so while Hinglish is on.
**Why:** translating claims would need a second model call (cost, and a translated paraphrase can drift from the cited quote); the acceptance line is "toggling never alters the source excerpt", so English-only for everything derived from the document is the safe reading. The Responsible Language lint only knows the English table, so a Hinglish table for prompts would go unlinted.
**How to apply:** if asked for translated prompts, treat it as a registry/model change, not a copy change. Keep the convenience note wording honest about exactly what is and is not translated.

# Read-time Proxy, not a hook

`copy` is a Proxy that resolves each top-level section against the display store on every property read; `JourneyRoutes` calls `useDisplay()` and owns the whole subtree, so one re-render swaps every screen.
**Why:** ~30 consumers import the singleton; a hook refactor was churn with no benefit. A key-remount was rejected because it would drop focus and form state on a language change.
**How to apply:** never capture `copy.section` at module level (a resource-cards constant did exactly this and froze in English) and never build an element outside the route tree and pass it in — React bails out on the identical element and it will not re-render. The DOM test mounts via a `body: () => ReactNode` render prop for the same reason.

# Same-in-both-languages is a curated list

`copy.test.ts` asserts every leaf differs between tables except an explicit allowlist (packet body, loanwords like Deposit/Clause, format functions). Add to the list deliberately; a whole untranslated section will fail it, which is the point.

# Speech synthesis in real browsers

- Headless Chromium has the API with zero voices: `speak()` fires `onerror` immediately with nothing heard. Treat an error before `onstart` as "no working voice" and say so; an error after speech began is an ordinary end.
- `cancel()` raises `interrupted`/`canceled` on queued utterances in Chrome but Safari fires `onend` for them, so a reading must be keyed by a run counter, not just the button id, or a stale end settles the new reading.
- Chrome stops long utterances silently (~15 s) with no end event: keep utterances short (split long sentences too, claims may be 400 chars) and keep a watchdog on `speaking`/`pending` so the button never sticks on "Stop".
- The changing button name ("Read aloud"/"Stop reading") is the state; do not add `aria-pressed` on top, it doubles the announcement.
