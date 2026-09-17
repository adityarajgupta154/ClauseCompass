---
name: Testing setup decisions
description: Why vitest runs from the repo root, how binary fixtures are handled, and how route tests boot the API without the workflow env.
---
# One vitest at the root

**Why:** PRD wants a single `pnpm test`; per-package configs would multiply setup and the `tests/` cross-package suites need one runner anyway. `vitest@^4.1` was chosen over 5.0.0 (released days earlier).

**How to apply:** Root `vitest.config.ts` includes `artifacts/**`, `lib/**`, `tests/**`. Tests import from `vitest` explicitly (no globals) so package typechecks resolve it from the root `node_modules`. Client tests that need a DOM opt in per file with `// @vitest-environment happy-dom` (happy-dom, not jsdom: pure JS, small); the default stays node. Such a test mounts the exported route table inside the real provider with wouter's `memoryLocation({ record: true })` and reads the location from `history.at(-1)`; seed provider state in a render *before* the routes mount (guards redirect in layout effects, before any passive seeding effect runs); the packages the test file itself imports (wouter, react-query) must be root devDependencies at the client's versions so pnpm links the same instances and React contexts match.

# Fixtures stay text

**Why:** repo-size rule and public-repo hygiene. PDF/DOCX inputs are generated at test time from the `.txt` fixtures; `samples/golden.json` is the human-checked truth for paragraph coordinates and every generated format must reproduce it exactly (that is what makes "correct page/paragraph metadata" checkable rather than circular).

# Route tests boot the real app

Config is read at import time, so set the env (`NODE_ENV=test`, a dummy `PORT`, `LLM_PROVIDER=mock`, `LOG_LEVEL=silent`) before a dynamic `import("../app")`, then `app.listen(0)`. Gotcha: `new Blob([uint8])` fails TS 5.9's `BlobPart` typing for `Uint8Array<ArrayBufferLike>`; wrap with `new Uint8Array(bytes)`. Background processes started for smoke tests must be stopped with SIGTERM (SIGKILL loses pino's buffered transport output, making it look as if nothing was logged).

# Worker threads under vitest

Vitest does not transform files a `new Worker()` loads, so a `.ts` worker fails on extensionless imports. Spawn it with `execArgv: ["--import", <absolute path to tsx's dist/loader.mjs>]`, resolving tsx with `createRequire(import.meta.url)` from the package that owns the worker — a bare `--import tsx` resolves from the cwd (the repo root when running `pnpm test`) and fails with ERR_MODULE_NOT_FOUND. In the esbuild bundle the worker is a second entry point and needs no loader; pick the file by whether `import.meta.url` ends in `.ts`.

# Measuring a zip before a library opens it

The measurement must mirror the reader that will open the file (JSZip for mammoth): read central entries while the signature matches (the EOCD count is not what JSZip uses), apply JSZip's offset shift whenever the directory ends short of the EOCD, refuse every EOCD field that flips JSZip into ZIP64 mode (all four 16-bit fields, not just the entry count), and refuse anything the measurer cannot follow instead of "letting the parser decide" — every divergence between the two readers is a bypass for a crafted archive. Declared sizes are irrelevant; inflate with zlib's maxOutputLength.

# happy-dom suites that need the API

The API cannot be booted in-process from a happy-dom file: vitest rewrites `import.meta.url` inside the server's modules to an http address under a DOM environment (files under `tests/` keep `file://`), so anything located from it — the extraction worker — fails while the server otherwise looks fine. **Decision:** DOM suites run the API as a child process and stub the page's relative `/api/...` calls onto its origin; uploads go over node:http because happy-dom's fetch resolves relative URLs to `localhost:3000` and its FormData encoding is refused by the multipart parser. Keep start + orderly stop + forced stop inside vitest's hook budget. Prove a DOM XSS suite can fail (temporarily render a claim with `dangerouslySetInnerHTML`) before trusting its green.

# Test layers as vitest projects

**Why:** PRD §12 wants `npm test` to report unit / schema / integration / adversarial / golden (and a11y) with a clear pass-fail. Rather than moving files into layer folders, layers are vitest `test.projects` (`extends: true`) whose include/exclude globs come from one ordered path table (`scripts/test/layers.ts`, first match wins, `unit` catch-all); a custom reporter (`onTestRunEnd`, `vitest.logger.log`) prints the per-layer table after the default reporter. `Vitest` exposes no CLI filters to a reporter, so an empty layer is shown as "no files in this run", never a failure; the guard test on disk is what proves every file has a layer and every layer has files.

**How to apply:** New test files need no registration unless they belong to a layer other than the one their directory implies — then add the path (directory with trailing slash, or exact file) to the table, above the catch-all. A wrong entry that covers no file fails `tests/support/layers.test.ts`. Don't walk `artifacts/` with `readdirSync({recursive:true})` in a test: it descends into every package's node_modules (~1.6 s); prune while walking.

# Golden pipeline suite

**Why:** Only end-to-end runs (real extraction, HTTP, all three formats) can pin page numbers and TXT/PDF/DOCX agreement, so `tests/golden/pipeline.test.ts` exists next to the function-level goldens. Mock claim text is not analysis, so it is pinned by shape (marker prefix, verbatim quote) and everything the product decides is pinned literally, with the paragraph's opening words so the tables can be checked against the fixture by eye. Timeline items and prompt "places" are product-lifted verbatim windows (ellipses added by `verbatimClaim`), not model text — they carry no marker.
