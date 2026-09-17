---
name: Design docs (design.md, design-prompts.md)
description: How the two UI spec documents relate to the code and how to keep them truthful when a screen changes.
---

Rule: `docs/design.md` (spec) and `docs/design-prompts.md` (paste-ready blocks) are hand-written from the code, not generated. Any change to a token, recipe, copy string or screen order must be mirrored in both, and every class string / quoted sentence added to them must be confirmed by grep against `artifacts/clausecompass/src` and `copy.en.ts` before it is written.

**Why:** Three review rounds on 15 Sep 2026 found ~50 mismatches that all came from paraphrase — explorer inventories, my own memory, and even the architect reviewer's findings each restated classes/copy loosely. Only a literal grep settled them (e.g. the slot label is sr-only in the *single* variant, the help link on Safety is outline-primary + ArrowRight, Not found has no footer, Compare excerpts are the one sans quotation).

**How to apply:** Write specifics only as exact copies of code; where the code varies by state, name the state instead of an absolute ("every paragraph max-w-prose" was false). Absolute rules in Block 0 carry their code exceptions (packet paper ring, error boundary, toast animation, Upload sample `disabled`). The Interview screen still shows the placeholder sentence "The rest of the questions step is being built next…" as live copy — the prompts document it verbatim; trim it in `copy.en.ts` (and both docs) when the user agrees.
