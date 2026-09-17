---
name: Preparation Packet export
description: Why the packet is a client-side model with two serialisations, how the artefact scan derives its forbidden list from the payload, and the print/paper quirks that cost retries.
---
# One packet model, two renderers, one scan

**Why:** FR-09's acceptance is "no hidden prompt text or raw API payloads leak into the export". Rendering HTML and text from the same pre-phrased model means a single scan over both outputs covers every export; if a renderer ever reached into the raw response the scan would see it. No model call is made for the packet — it folds the map and review-prompts responses the reader has already seen, so nothing new can appear in the export that was not on screen.

**How to apply:** New packet content goes through build-packet (items are statement | question | check | citation | note) and every reader-facing string must show up in packetStrings, which the export test uses to prove both renderers carry every string verbatim. Do not uppercase or otherwise transform model text in a renderer — the verbatim check is the point.

# The forbidden list comes from the payload, not from a hand-written list

**Why:** A hand-written list of "bad words" goes stale the first time the API adds a field. The scan instead walks the actual JSON of both endpoints and forbids every identifier-shaped key and every identifier-shaped whole value (kebab/dot/snake tokens and paragraph ids), except values under clause and category keys, because clause numbers are legitimately quoted and category keys coincide with contract English. Structure artefacts (JSON braces, [object Object], undefined, NaN, raw ISO dates, confidence decimals), system-prompt lines, the tool name and credential shapes are the fixed part.

**How to apply:** A mutation check (render a raw field, watch the test fail) is the way to trust a change to the scan; done for a snake_case key, a "status: found" label and a bare confidence decimal. Plain-English keys (status, text, confidence) are forbidden only in label form (key followed by : or = on the same line, case-sensitive) because they are ordinary words elsewhere. HTML hygiene checks must be tag-aware (React escapes < in text, so an escaped onerror= inside quoted clause text is correct, not a leak). A model that obeys an injected instruction in paraphrase is the entailment gap (working-mode.md), not an export leak — the export can only carry what the review endpoint already returned.

# Paper sheet quirks

- The sheet is a fixed light surface in both themes (neutral classes, borders not fills); printing from dark mode must still come out white — checked with emulateMedia print + page.pdf, not by eye.
- Reference lists wrap only if whitespace-nowrap sits on each [n] link, not the whole list; a long "Found at" trail overflowed a 390 px screen otherwise.
- The Responsible Language lint trips on the boundary sentence itself ("whether a clause is legal or fair"); the export test excepts that one string and pins it to the welcome boundary copy instead of loosening the lint.
