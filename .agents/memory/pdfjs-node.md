---
name: pdf.js in Node (extraction)
description: What broke and what was verified when running pdfjs-dist v6 inside the api-server on Node 24, plus the deliberate choices behind the PDF paragraph heuristics.
---
# pdf.js in Node

Traps hit while wiring pdfjs-dist v6 (the setup itself is documented in replit.md Gotchas):
- The default `build/pdf.mjs` throws `hashOriginal.toHex is not a function` on Node 24; only the legacy build works.
- There is no `doc.destroy()` — call `task.destroy()`. `isEvalSupported` was removed in v6 (typecheck fails if passed).
- Error names: `PasswordException` (code 1 = needs password) → encrypted; `InvalidPDFException` / anything else on open → malformed.
- Bundling pdfjs-dist with esbuild breaks its worker-relative import and the optional `require("@napi-rs/canvas")`; keep it external.

# Paragraph heuristics (why these choices)

**Why:** PDFs store no paragraph boundaries. Word exports put ~6–10 pt "space after" (gap ≈ 1.43–1.7× line pitch); typewriter-style exports use a blank line (2×). Numbered legal clauses with zero extra spacing are the remaining common case.

**How to apply:** Gap ratio threshold 1.3 catches both export styles. The line pitch is the *smallest plausible* gap (0.8–3.5 font sizes), measured in font sizes: a frequency-cluster estimate was tried first and failed on a page of one-line paragraphs with a single wrapped line (the paragraph gap became the "pitch" and the page merged into one chunk); measuring in font sizes stops a small-print footer from shrinking the body pitch. A page with only one-line paragraphs and no wrapped line (the NDA signature block alone on the last page at 40 lines/page) has no gap smaller than its paragraph spacing, so the page-local minimum made the whole page one chunk; found by the pipeline golden. Fix: measure the document's pitch first (lines are collected for all pages before any page is paragraphed) and use it on a page whose plausible gaps are uniform (spread < 0.1 em) and > 1.3× that pitch. The document pitch is the *mode* of all plausible gaps (0.05 em bins, neighbours pooled, ties to the tighter), not the minimum: the review round showed a global minimum lets one tight letterhead block split every uniform page per line, and a mode over all pages also keeps a double-spaced document at its own pitch. Counting only non-uniform pages was tried and rejected: a single-spaced letterhead page then dictated the pitch for a double-spaced body. Known trade-off: a double-spaced body under a single-spaced header splits per line. The clause-number rule only fires after a short previous line, otherwise wrapped lines that happen to start with "2." would split. Lines stay in content-stream order (sorting lines by position would break columns), but runs *within* a line are sorted by position (descending for RTL) because out-of-order runs are common in exported PDFs. Lines are split into orientation streams before paragraphing: a diagonal watermark run between two body lines otherwise splits the paragraph and hides the body's true line pitch. All of this is pinned by tests with hand-built TextItems (pdf-layout.test.ts) and by a mutation check: setting the ratio to 5 makes the fixture round-trips fail.
