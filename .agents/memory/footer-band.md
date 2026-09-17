---
name: Footer paper band and its margin decorations
description: Lessons from restyling the shared footer as a paper sheet with margin cutouts (olive branch + note, compass rose + card stack); read before touching the footer, its copy, or any decoration with words.
---
# Straight band, paper look through tint + grain

The reference showed a tilted floating sheet; the band stays straight (a tilt reads as a fault and adds page height on every screen). The paper look is `bg-secondary/45` plus a `paper-grain` `@utility` in `index.css` — a tiled feTurbulence SVG data URI (`%25` for `%`, `%23` for `#` inside `url("data:image/svg+xml;utf8,…")`) multiplied at ~0.07. Tailwind v4 accepts the data URI inside `@utility`; keep the grain on its own `aria-hidden` span so `print:hidden` can drop it.

# Anchor a handwritten note to a rotated cutout in rem from the band's middle

The note and the branch are both offset from `top-1/2` in rem (`top-[calc(50%+2.75rem)]`), never in `%` of the band. **Why:** the band's height differs per locale, width and text size, so a `%` note landed on the leaves in Hinglish and below them in English. Eyeballing screenshots failed twice; measuring `getBoundingClientRect()` of the rotated image against the note settled it in one pass.

# Every visible letter comes from copy, even inside decorative SVG

A review failed the compass rose for hard-coded `N E S W` `<text>` glyphs although the whole subtree is `aria-hidden`. Rule: the letters live in both locale tables (`footer.compassPoints`), are read at render time (the copy Proxy is read-time; module-level geometry may hold angles only), and identical strings need an `ENGLISH_ON_PURPOSE` pattern in `copy.test.ts`.

# Hinglish for "fairer" is the loanword "fair", not "behtar"

"Behtar" (better) drops the fairness idea and a review read it as a meaning drift; the footer lines use "fair kal", "fair faislon mein madad" (keeping "supports" as "madad"). The older `welcome.helpAside.note` still says "behtar kal" — align it if that copy is touched. A card overlay of ~36 characters at `6.2cqw` on the 15rem stack fills the top card in 4–5 lines and stops just above the pen; longer lines cross the pen.

# Cutouts: crop to the alpha box when shrinking

`generateImage` with `removeBackground` returns the object centred in a 1024² frame with wide empty margins; the headless-Chromium canvas → WebP step should crop to the alpha bounding box (+6px) so the asset's box is the object's box and `%`-positioned overlays land on the object. The olive branch and card stack were generated with "plain pure white background, no text" prompts and came out clean on the first run.
