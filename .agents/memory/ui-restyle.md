---
name: Restyling the UI without breaking the contracts
description: What went wrong when a design subagent restyled the whole app in one pass, and the checks that catch it; read before any visual pass over the journey screens.
---
# Delegate presentation, not files

A design subagent given whole files restyled ~24 of them and, along the way: stripped every explanatory comment, replaced `ol/li` and `p` hosts with `div`/`span` (data-testid contracts say same element kind), moved copy around (a sentence shown once inside a notice became a badge on every item; a sentence was passed as a `missing` argument that gets formatted into another sentence), added a footer with session controls to a screen that never had one, and invented context fields in logic-heavy files.

**Why:** the model treats the file as a canvas; it does not know which markup is a contract (testids, one h1, list semantics, copy keys, print variants) and which is decoration.

**How to apply:** give the subagent presentational files only (cards, badges, layout shells) and restyle logic-bearing pages yourself; then run the checks below before believing "no behaviour changed".

# Checks that catch a visual regression cheaply

- Testid host audit: for every changed tsx, list `data-testid` → nearest opening tag in HEAD and in the working tree (walk back from each `data-testid=` to the previous `<`, since the attribute is often on its own line) and diff the two lists.
- Comment count per file vs HEAD (`grep -c` of `//`, `/*`, `{/*`); a drop means a comment was stripped.
- `tsc --noUnusedLocals` on the artifact: restyles leave dead imports (Link, DisplayBar) behind.
- The committed a11y runner (`pnpm a11y`), the screenshot tour at 1280 and 390 (file names in flex rows overflow on phones unless the row and its parent have `min-w-0`; use `[overflow-wrap:anywhere]` on names), and a print check of the packet wrapper (screen-only "desk" chrome needs `print:` resets).
- Text opacity utilities (`text-primary/80`, `placeholder:text-muted-foreground/70`) are how the AA failures arrived; full-strength tokens only for text.

# Decisions kept

- Site header: shared component with an optional back link; the welcome screen hides the brand mark (its h1 is the name), the safety screen passes `home={false}` (no anchor back into the journey).
- Pre-existing, deliberately left alone by the restyle: native `disabled` on the sample buttons while a sample loads, and the printable packet sheet keeping its own `<h1>` beside the screen heading.
