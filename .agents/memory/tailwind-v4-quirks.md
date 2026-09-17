---
name: Tailwind v4 quirks in this repo
description: Cascade-layer behaviours that silently defeat utilities (hidden attribute vs print/override utilities).
---
# The HTML hidden attribute cannot be overridden by any utility

**Why:** Tailwind v4 preflight declares `[hidden] { display: none !important }` inside `@layer base`. For `!important` declarations the layer order is reversed, so an important rule in the earliest layer beats important rules in utilities and unlayered CSS alike. `print:block`, `print:block!`, `md:block` etc. all lose against it; the element stays hidden with no error.

**How to apply:** when a collapsed region must become visible under some variant (print, breakpoint, forced-open), toggle the `hidden` *utility class* (`open ? "block" : "hidden"`) instead of the `hidden` attribute; utilities in the same layer resolve by source order and variants come later, so `print:block` then works. Keep `aria-expanded`/`aria-controls` on the trigger either way. Verified with Playwright `emulateMedia({ media: "print" })`.

# An arbitrary `min-[Npx]:` variant does not override `lg:` for the same property

**Why:** in this build `min-[1400px]:inline-flex` was emitted *before* `lg:hidden` in the stylesheet, so at ≥1400px both matched and `lg:hidden` won by source order; the element never reappeared, with no error. Seen 17 Sep 2026 on the header account control.

**How to apply:** express a window with one stacked variant instead of two competing ones: `inline-flex lg:max-[1400px]:hidden` (hidden only for 1024 ≤ w < 1400). Verify with a viewport sweep in Playwright (`getComputedStyle(el).display` at each width), not by eye.
