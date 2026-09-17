---
name: Welcome hero, brand mark and decorative motion
description: Constraints learned while adding the welcome banner, the compass brand mark and hover/entrance motion; read before touching the hero, the logo, or any animated decoration.
---
# Size the product name in container units, not rem or vw

The h1 on the welcome screen uses `clamp(<rem floor>, <n>cqw, <rem cap>)` inside an `@container` column.

**Why:** the text-size control scales the root font-size (up to 150%). Any rem-based size for the one unbreakable word "ClauseCompass" overflowed a 390px phone at 150%, and because the hero band is `overflow-hidden` with a grid child of `min-width:auto`, the whole hero grew to ~505px and the right side of the picture was clipped. `cqw` does not scale with the root font-size, so the word always fits its column.

**How to apply:** keep `min-w-0` on both grid children; check 390px and 1280px at 150% in both locales after any hero change (measure `document.documentElement.scrollWidth`).

# Reduced motion: the global rule shortens duration, not delay

`index.css` cuts every animation to one instant run under `prefers-reduced-motion`, but an `animate-in … delay-150 fill-mode-both` entrance still sits at its start frame (opacity 0) for the delay. Put `motion-reduce:animate-none` on delayed entrances; the decorative loops (float/sweep/glow/dash) are fine because their rest frame is their end frame.

# In-page CTA anchors need a focusable target

A fragment link (`href="#stage-heading"`) scrolls but leaves focus on `body` unless the target has `tabIndex={-1}`; the visible focus rule in `index.css` covers `h1[tabindex="-1"]` and `h2[tabindex="-1"]`. Verified with Playwright: after Enter, `document.activeElement` is the h2 and `:focus-visible` matches.

# Decorative pictures must not imply outcomes

A green tick badge on the drawn document was read by review as "verified/approved"; it was replaced by a reading glass. Rule: motifs may show what the product does (reads, points, labels) and never a verdict; labels inside the picture come from existing copy keys (`copy.map.fields.*.title`), never invented text.

# The hero photograph is a generated still life with overlays; keep the box shape fixed

The user chose a photographic hero matched to their reference over the drawn illustration; if the picture must change, regenerate (prompt describes the reference's object layout) rather than redraw.

**Why:** the card, route and handwritten notes are overlays positioned in % of the box, so only a fixed aspect box keeps them on the right objects at every width. Notes and route use fixed ink/terracotta rather than tokens because the photo stays light paper in dark mode; anything sitting in the masked (faded) edge of the photo would land on the dark page, so overlays stay inside the unfaded area. Overlay text comes from copy keys so it translates; the photo's own words (AGREEMENT, book spines) are props and were accepted as such, but a reviewer will flag them — decide deliberately.

**How to apply:** after replacing the photo, re-measure the landmarks (outlined paragraph, folder front, empty wall) and retune the route path, card and note positions; check phone, 1280 and 1536, light and dark.

# Hero controls scale with the column, not the viewport

Buttons, feature icons and the feature row's orientation use container variants (`@lg`) on the left column, not viewport variants.

**Why:** 1280px is exactly Tailwind's `xl` breakpoint, so `xl:` gives a 1280 laptop the 1536 sizes, and at 1024 the 45% column (~400px) cannot hold a horizontal row of three with dividers; both overflowed under the picture (hidden by `overflow-hidden`, so no page overflow warned about it). The column width is the real constraint.

**How to apply:** measure the row's right edge against the picture's left edge at 1024/1280/1536 (and 150% text) rather than trusting scrollWidth alone. The header likewise wraps its row from lg so the largest text size on 1024 drops the controls under the brand instead of over it.

# Pictures in the page margins beside a centred card

The boundary statement's papers and note sit in absolutely positioned boxes whose width is the page margin (`calc((100% - <card max-w>)/2 - gap)` inside a full-width band, not `vw`) and whose content shows only above a container-query threshold written in rem.

**Why:** `100%` of the band ignores the scrollbar, so nothing pokes past the viewport; the rem threshold tracks the text-size control (the card widens in rem and the margin closes), which no viewport breakpoint can see. The band is `overflow-x-clip`, never `overflow-hidden`, so the cutout may bleed off the page edge while the card's shadow still falls below. Cutouts come from `generateImage` with `removeBackground` and are shrunk to WebP with alpha in headless Chromium (canvas → toDataURL) — no image toolchain is installed here.

**How to apply:** a decoration that only fits at some widths gets a margin box + `@min-[Nrem]` query, not `hidden xl:block`; check 1280 (hidden), 1440 (bleeds), 1536 and 150% text (hidden).

# Matching a reference "same to same": props may carry words, type comes from copy

When the user hands over a reference picture and asks for an exact match (the choice section's margins), the photographed props are generated to match it, baked-in words included (book spines reading CONTRACTS / RIGHTS / PEACE OF MIND, like the hero photo's AGREEMENT / RIGHTS spines). Anything set in type or handwriting stays an HTML overlay from a copy key so it translates. A first pass with blank spines and a three-quarter view was rejected as "very different" — front-facing spines with the words were what made it read as the reference.

**Why:** the user judges these sections visually against the reference; a translated overlay on a book spine cannot look embossed, and the hero already set the precedent that English prop words are accepted.

**How to apply:** for a cutout whose text sits at the picture's centre, keep the bleed under ~20% of its width or the words get cut; let it run a few px under the neighbouring card instead (cards are positioned and later in DOM order, so they paint over the aside). Blurred foreground/background foliage is one leaf cutout reused with CSS `blur-*`, `brightness-90 saturate-[0.85]`, rotations and opacity — no second generation needed. Card drawings that must read as large as the reference's take the card's full inner width with the arrow badge absolutely positioned in the corner, and SVG filter ids come from `useId()` because three drawings share the page.

# The margin-decoration pattern now covers five bands

Boundary statement (53rem card), the choice (72rem row), the official-help card (66rem) and, on the upload screen, the heading (53rem) and the document card + notice (66rem) all use `MarginAside`; each new width needs its own literal entry in its class tables. A full-bleed tinted band that is the wrapper's last child gets a negative bottom margin equal to the wrapper's bottom padding so it meets the footer — safe only while it stays last. Dark mode is class-based (`.dark`) and nothing in the product toggles it, so `colorScheme: "dark"` screenshots come out light; do not report them as a dark-mode check. A review will read a copy line like "get help directly, without sharing documents" as a promise about third-party services — scope such lines to what ClauseCompass itself asks for.

# Pictures inside a screen that the adversarial tests render

The XSS rendering test mounts the real screens and asserts the exact set of `<img>` addresses on each: the bundled assets as the bundler resolved them (the test imports the same asset modules), empty alt, inside an `aria-hidden` subtree. Every screen with the footer carries the footer's leaf; the upload screen adds its own pictures. A new decorative picture on any mounted screen fails the test until its import is added to that screen's expected list.

**Why:** a basename allow-list was reviewed as too weak (a bundled name on a foreign host would pass), so the test compares full addresses; the strictness is the point, since the hostile file name is an `<img>` payload.

# Decorations that hang past a band's bottom edge

A margin decoration that is offset past the band's bottom (a leaf anchored at `-bottom-20`, rotated) must be clipped by its own margin box (`className="overflow-hidden"` on `MarginAside`), not left to the band.

**Why:** bands are `overflow-x-clip` only, so anything past the bottom edge extends the document (a blank strip of page under the footer, ~100px at 1536) and anything past the box's inner edge can reach the text column; only a review round caught it because scrollWidth stayed clean.

**How to apply:** after placing a bleed decoration, compare `document.documentElement.scrollHeight` with and without it, and check the reveal threshold width (13rem margin ≈ 1264px for a 48rem column) as well as 1536.

# Footer help section is omitted on /help by location, not CSS

The shared footer names the way to official help as a section (eyebrow, h2, line, link). On `/help` the whole section is left out through `useLocation()`, since hiding only the link (the old `aria-[current=page]:hidden`) would leave a heading pointing at the page itself; the boundary line stays. `HelpLink` still sets `aria-current="page"` on `/help` for any other place that renders it.

# Local screenshot checks

playwright-core scripts must live inside the workspace tree (`/tmp/*.mjs` cannot resolve the package). `click()` on an `aria-disabled` button waits ~30s per attempt; use `evaluate(el => el.click())`. `pkill -f <pattern>` inside ShellExec matches its own command line; bracket the first character. The a11y journeys need the mock API as a background task (`&` dies with the shell) and `/api` on port 80 returns 502 until it is up.

# Small tooling notes

- prettier is a root devDependency but the tsx files are not consistently prettier-formatted; running it on one file produces a large formatting diff. Edit by hand instead.
- lucide-react 0.545 has `GitCompareArrows`, `FilePenLine`, `MessageSquareWarning`, `DoorOpen`, `CalendarClock`, `ClipboardList`, `IndianRupee`; there is no `FileSignature`.
- Rotating SVG `<g>` with Tailwind `rotate-*`/`group-hover:rotate-*` works when the group has `origin-center [transform-box:fill-box]`; the brand mark's needle relies on it.
