---
name: Header settings menu & theme
description: Decisions behind the gear-menu in the site header (language, text size, theme, help/feedback/about rows) that the code does not explain by itself.
---

# Header settings menu — decisions

- **Image over brief.** When the navbar brief and its reference image disagreed (gear colour, panel width), the image won; the user treats the picture as the spec. Panel width was measured from the image, not taken from the brief's pixel number.
- **Panel anchor.** The panel hangs from the header's right-hand control group, which must stay `relative`; anchoring to the gear alone pushed it off-screen on phones.
- **Hidden, not unmounted.** The panel stays in the tree with the `hidden` attribute so `aria-controls` always resolves; no `menu` roles on purpose (it is a labelled section of `aria-pressed` buttons and links, so arrow-key behaviour is not promised).
- **Convenience note stays on the screen.** The Hinglish "convenience text" note is a strip under the header row, never only inside the panel: the screen must say it while the panel is closed. Tests assert the note is outside the panel.
- **Feedback row is gated.** "Give feedback" renders only when `VITE_FEEDBACK_URL` is `https:`/`mailto:`; otherwise it logs an error and hides. No invented destination; the user had not supplied one as of 2026-09-17.
- **About row and the safety screen.** The about link targets the welcome screen's boundary heading and is omitted when `home={false}`, because `/` is a journey path and the escalation-routing test checks every anchor on the safety screen. The wouter Link does the navigation (it already skips modifier clicks); the handler only closes the panel and moves focus after render.
- **Theme.** Default `system`; dark mode was checked on welcome, help, map and packet (the packet's paper sheet stays white by design). Dark tokens are `@media screen` only so print stays light. The pre-paint script in index.html reads the same storage key as the store — change the key or the theme values in both places, and any future CSP needs a hash/nonce for that inline script.
- **Header at phone widths.** Auth buttons go icon-only below `sm`, the signed-in name shows from `lg`, and a back link takes its own row below `md` so brand + controls always share row one at 390px.
