# ClauseCompass — copy-paste UI prompts, screen by screen

Ye file `docs/design.md` ka copy-paste roop hai: har screen ke liye ek self-contained prompt block, jo kisi bhi UI builder ya coding agent mein seedha paste kiya ja sakta hai. Har block 15 September 2026 ke code aur `copy.en.ts` se likha gaya hai; jahan yeh file aur `design.md` alag lagen, `design.md` sahi hai.

Kaise use karein:

1. **Block 0 hamesha pehle paste karo** (ya tool ke "project instructions" / system prompt mein ek baar daal do). Ismein tokens, fonts, shared components aur rules hain.
2. Phir **ek baar mein ek screen ka block** paste karo (Block 1–10, Block 6a Ask screen ke liye). Har block mein layout order, exact classes, exact copy aur states hain.
3. Copy strings **verbatim** rakhein; naye sentences mat likhwao. Copy ka source `artifacts/clausecompass/src/features/journey/copy.en.ts` hai.
4. Screen ban jaane ke baad **Block 11 (checklist)** paste karke verify karwao.

---

## Block 0 — Project context (paste first, always)

```text
PROJECT CONTEXT — ClauseCompass web client. Paste this before any screen block.

PRODUCT
ClauseCompass explains what a legal document says in plain language, shows the exact wording each statement rests on, and prepares the reader for a conversation with a lawyer or a legal-aid service. It gives information, not legal advice. Readers are often anxious, on a phone, and not fluent in legal English. Audience: India.

STACK
React 19 + Vite + TypeScript, Tailwind CSS v4 (utility classes; tokens are CSS variables exposed as bg-*/text-*/border-* utilities), lucide-react icons, Wouter routing. No shadcn/ui or other component library: every control is a native element. No images anywhere.

VISUAL CONCEPT — "paper and ink"
A warm off-white page, dark ink text, ONE centred reading column, one brick-red accent used only for what the reader can act on or must notice. It must read like a well-set document, not a dashboard.

LAYOUT RULES
- One column: max-w-3xl (48rem), px-6 side padding, pb-20 bottom padding. No sidebars, tabs, modals, drawers, carousels, steppers/progress bars, hero images, illustrations, gradients, background patterns or entrance animations.
- The only two-column layouts: small grids of equal cards (sm:grid-cols-2) and the older/newer excerpt pair in Compare (md:grid-cols-2).
- Breakpoints: sm 640px and md 768px only. Must work at 320px wide, at 150% text size and at 200% browser zoom without horizontal scrolling. Everything wraps (flex-wrap, [overflow-wrap:anywhere], truncate inside min-w-0).

COLOUR TOKENS (Tailwind name → HSL → hex). Use token names, never raw hex in components.
background 45 30% 98% #fbfbf8 (page) · foreground 220 28% 16% #1d2534 (text) · card / popover 0 0% 100% #ffffff (raised surfaces) · border / input 38 18% 86% #e2ddd5 (all hairlines) · primary / ring 12 62% 43% #b2452a (actions, links, notices, focus ring) · primary-foreground 0 0% 100% #ffffff · secondary / muted 40 20% 93% #f1eeea (quiet panels, empty cards) · muted-foreground 215 16% 35% #4b5768 (secondary text) · accent 40 20% 90% #ebe7e0 (reserved, unused) · destructive 0 65% 40% #a82424 (errors) · destructive-foreground 0 0% 100% #ffffff
Topic ("family") colours, used ONLY in badges and Compare's <ins> marks, never as card backgrounds: family-money 152 48% 27% #246647 · family-time 216 58% 38% #295699 · family-duty 272 38% 40% #693f8d · family-exit 24 68% 34% #924b1c · family-data-ip 190 62% 26% #195e6b
Allowed opacity tints: primary/5 (notice fill), primary/10 (badge fill, outline-primary hover), primary/20 (text selection), primary/30 and primary/40 (notice borders, link underline), primary/50 (list bullets), primary/60 (hover border), primary/90 (hover fill); destructive/5, /15, /40, /60, /70; border/80; foreground/80, /90; muted/60; muted-foreground/70.
Light scheme only. No dark mode, no theme toggle.

TYPOGRAPHY (self-hosted @fontsource-variable files, display=swap, metric-matched local fallbacks)
- font-sans = DM Sans (400–700): all product text — body, labels, controls, metadata.
- font-serif = Lora (400–700): headings, the Welcome intro, and every verbatim quotation from the document (one exception: Compare's marked excerpts are sans, see Block 7).
- Weights: 400 body; 500 (font-medium) headings and control labels; 600 (font-semibold) card titles, statuses, primary calls to action, uppercase labels. Never 700.
- Type roles (exact classes):
  Screen title (h1): font-serif text-4xl font-medium tracking-tight text-foreground md:text-5xl
  Section heading: font-serif text-3xl font-medium tracking-tight text-foreground
  Sub-section heading: font-serif text-2xl font-medium text-foreground md:text-3xl
  Card title: font-serif text-2xl font-medium tracking-tight text-foreground
  Lead paragraph (under every h1): max-w-prose text-lg leading-relaxed text-muted-foreground
  Claim (a statement about the document): text-lg leading-relaxed text-foreground md:text-xl
  Quotation (document's own words): whitespace-pre-line font-serif text-base leading-relaxed text-foreground md:text-lg
  Body: text-base leading-relaxed text-foreground · Body quiet: …text-foreground/80 · Body muted: …text-muted-foreground
  Bulleted point: li flex gap-4 text-base md:text-lg text-foreground/80 leading-relaxed, with an aria-hidden "•" span select-none text-primary/50 mt-1 (no list-style)
  Status title: text-lg font-semibold text-foreground
  Metadata: text-sm text-muted-foreground
  Uppercase label: text-sm font-semibold uppercase tracking-wide text-muted-foreground
  Control label: text-base font-medium · Numbers: add tabular-nums
- All sizes in rem (a text-size control sets html font-size to 100/115/130/150%). max-w-prose (65ch) and leading-relaxed on running paragraphs; short one-line labels, hints and card metadata may omit them (each screen block gives the exact classes). No justified text.

SPACING, SHAPE, ELEVATION
- Vertical rhythm: sections in a screen space-y-12 (Interview space-y-10; Welcome space-y-14 md:space-y-16); between cards space-y-5 or space-y-6; inside a card space-y-4; tight stacks space-y-3; heading + description space-y-2.
- Padding: cards p-5 md:p-6 (large p-6 md:p-8); notices p-4 or p-5 md:p-6; list items p-4.
- Radii: rounded-2xl cards, slots, notices, textarea · rounded-xl buttons, excerpt boxes, expanded paragraphs · rounded-3xl emergency panel and not-found icon tile · rounded-md text links, back links, skip link · rounded-full badges and pills · rounded-sm inline marks and inline links · rounded checkbox.
- Borders: border (1px) resting cards; border-2 interactive cards, slots, buttons, alerts; border-2 border-dashed "nothing here" cards; border-l-4 evidence panels (border-primary/40) and places (border-border); border-t section breaks and the footer.
- Shadows: shadow-sm on cards and slots; shadow-md ring-1 ring-neutral-200 on the packet sheet; shadow-lg on the 64 px primary actions and the analysing card. Nothing else.
- Hover: border colour only (hover:border-primary/60) on cards and outline buttons; primary buttons hover:bg-primary/90; underlined links hover:decoration-primary. Nothing moves, grows or fades.

FOCUS, TARGETS, STATES
- focusRing — use verbatim on every focusable element (exceptions: the printed packet sheet, Block 8, has its own paper ring; the last-resort error boundary, Block 10b, is unstyled plain Tailwind): focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background
- A label wrapping a hidden native input uses: has-[:focus-visible]:border-primary has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background
- A focused h1[tabindex="-1"] shows outline: 3px solid primary; outline-offset: 6px; border-radius: 4px.
- Minimum heights: 44px every control; 48px continue links and packet actions; 56px the Interview Continue; 64px the Upload Continue and the safety call buttons. Icon-only buttons also min-w-[44px]. Adjacent targets at least gap-2 apart (gap-3 in most rows).
- Disabled = aria-disabled="true" + opacity-70 (control stays focusable, label readable). Do not use the disabled attribute (single exception: the Upload sample buttons while a sample loads, which use disabled + disabled:opacity-60).
- Text selection: selection:bg-primary/20 selection:text-foreground (Welcome, Not found).

ICONS — lucide-react only, always aria-hidden="true" with a visible text label (icon-only buttons carry aria-label).
Sizes: h-4 w-4 in badges and small labels · h-5 w-5 in buttons and links · h-6 w-6 status titles and section markers · h-7 w-7 Siren · h-9 w-9 Upload (empty slot) · w-12 h-12 not-found tile.
Meanings: ArrowLeft back · ArrowRight forward · Check done/chosen · AlertCircle error · AlertTriangle caution/low confidence · Info boundary/notice · ShieldCheck data handling, deletion, "Information and data", a checked listing · Clock retention · LoaderCircle busy (animate-spin motion-reduce:animate-none) · FileText a document or a location · FileQuestion not found · FileCheck2 no differences · EyeOff withheld · Quote wording-only · ChevronDown disclosure (rotate-180 when open) · Volume2 / Square read aloud / stop · Languages · AArrowDown / AArrowUp text size · Trash2 delete · RotateCcw retry, start again · Printer · Download · Siren · LifeBuoy official help · Phone helpline, the footer's help link · MessageSquareText · ExternalLink · CalendarDays · CalendarCheck · CalendarClock · IndianRupee · ClipboardList · ClipboardCheck · DoorOpen · Scale · Type.

MOTION — transition-colors on hover only; spinners animate-spin motion-reduce:animate-none; disclosure chevron transition-transform motion-reduce:transition-none; a global prefers-reduced-motion rule collapses all animation. No entrance animations on page content except the welcome screen's one-time fade-in (animate-in fade-in, motion-reduce:animate-none). Route changes: focus the h1 without scroll animation, then scroll to top.

SHARED COMPONENTS (exact recipes)

Page frame — every screen owns its own; there is no layout component:
  <div class="flex min-h-[100dvh] flex-col font-sans">
    Skip link: <a href="#main"> "Skip to content" — class: sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-50 px-4 py-2 bg-primary text-primary-foreground font-medium rounded-md focus:outline-none focus:ring-4 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background
    Site header (below): brand, back link, settings menu, account control
    <header class="mx-auto flex w-full max-w-3xl items-center px-6 py-6 md:py-10"> back link </header>
    <main id="main" class="mx-auto w-full max-w-3xl flex-1 space-y-12 px-6 pb-20">
      <div class="space-y-4"> h1 (screen title) + lead paragraph </div>
      …sections…
    </main>
    Footer (below), mt-auto — every screen except Not found
  </div>

Site header: <header class="relative z-40 w-full border-b border-border/80 bg-card shadow-sm print:hidden lg:sticky lg:top-0">; row mx-auto flex w-full max-w-[110rem] flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3 lg:px-[max(2rem,5.5vw)]: brand mark + wordmark (motto under it from md), the back link (its own row below md), then the control group relative order-2 ml-auto flex shrink-0 items-center gap-2 sm:gap-3 md:order-3 = settings gear, hairline h-8 w-px bg-border, account control.
  - Settings gear: <button aria-label="Settings" aria-expanded aria-controls=panel> inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-primary transition-colors hover:bg-primary/15 + focus ring, Settings icon h-[1.375rem] w-[1.375rem] stroke 1.75. Toggles the panel.
  - Settings panel: <section aria-label="Settings" hidden-while-closed> absolute right-0 top-[calc(100%+0.625rem)] z-50 w-[min(25rem,calc(100vw-2rem))] rounded-[1.25rem] border border-border bg-card p-2 text-left shadow-[0_24px_48px_-16px_rgba(31,42,58,0.28)]. Closes on Escape (focus back to the gear), on a press outside, and when focus leaves it.
  - Setting rows (role="group" + aria-labelledby): flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2; icon disc flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-primary (icon h-[1.125rem] w-[1.125rem], stroke 1.75) + name text-sm font-medium text-foreground md:text-[0.9375rem]; the control at the right.
    - "Language" (Globe): segmented box inline-flex items-center gap-0.5 rounded-xl border border-border bg-background p-0.5 with aria-pressed buttons "English" (lang="en") and "Hinglish" (lang="hi-Latn"). Segment: inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[0.625rem] px-3 text-sm font-medium transition-colors md:text-[0.9375rem] border + focus ring; pressed border-primary bg-primary text-primary-foreground shadow-sm, unpressed border-transparent text-foreground hover:bg-secondary hover:text-primary.
    - "Text size" (Type): "Smaller text" (AArrowDown h-5 w-5) and "Larger text" (AArrowUp) buttons, segment class + min-w-[44px] !px-2 border border-border bg-card text-foreground (hover:border-primary/50 hover:text-primary when a step exists; cursor-default text-muted-foreground/60 + aria-disabled at an endpoint); readout between them inline-flex min-h-[44px] min-w-[4rem] items-center justify-center rounded-[0.625rem] border border-border bg-card px-2 text-center text-sm font-semibold tabular-nums text-foreground md:text-[0.9375rem], aria-live="polite", sr-only "Text size {percent}%". Steps 100/115/130/150 %.
    - "Theme" (Contrast): the same segmented box with "Light", "Dark", "System" (aria-pressed); sets the dark class + color-scheme on <html>; "System" follows prefers-color-scheme.
  - <hr class="mx-3 my-1.5 border-border/80">, link rows flex min-h-[48px] items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted md:text-[0.9375rem] + focus ring (icon disc + name, ChevronRight h-[1.125rem] w-[1.125rem] text-muted-foreground at the end): "Help & support" (CircleHelp) → /help; "Give feedback" (MessageSquare) → VITE_FEEDBACK_URL, new tab, only when set; <hr>; "About ClauseCompass" (Info) → /#boundary-heading (welcome screen's boundary statement, focused; not on the safety screen).
  - When Hinglish is selected, a strip under the header row (border-t border-primary/15 bg-primary/5; inner mx-auto flex w-full max-w-[110rem] items-start gap-2 px-6 py-2.5 text-sm leading-relaxed text-primary lg:px-[max(2rem,5.5vw)], Languages h-5 w-5): "Hinglish is convenience text, not the authoritative version. The document's own wording, and every statement prepared from it, is shown as it is, untranslated; the packet is prepared in English."

Footer: <footer class="relative mt-auto w-full overflow-x-clip border-t border-border/60 bg-secondary/45 px-6 pt-10 md:pt-12 print:border-0 print:bg-transparent">, set like a sheet of paper: a grain layer over the tint (a tiled fractal-noise SVG utility "paper-grain", absolute inset-0 opacity-[0.07] mix-blend-multiply dark:opacity-[0.05], aria-hidden, print:hidden).
  - Only when a session exists (first, in a relative mb-10 md:mb-12 wrapper): card max-w-2xl mx-auto flex flex-col items-center gap-5 text-center print:hidden bg-card border border-border/60 p-8 rounded-3xl shadow-sm with the button "Delete my document now" (min-h-[48px] rounded-xl border-2 border-border bg-background px-6 text-base font-semibold, hover:border-destructive hover:text-destructive hover:bg-destructive/5 aria-disabled:opacity-70, Trash2 h-5 w-5; busy label "Deleting…") and its note (text-sm md:text-base text-muted-foreground leading-relaxed): "Removes the document's text and everything prepared from it, from ClauseCompass and from this browser's memory. Without this, ClauseCompass deletes it {N} minutes after your last action. Anything you have printed or downloaded stays with you." On failure an aria-live="assertive" line (flex items-start gap-2 text-left text-base font-medium text-destructive bg-destructive/5 p-3 rounded-xl border border-destructive/20 + AlertCircle h-5 w-5): "ClauseCompass could not confirm the deletion just now. Try again in a moment; either way, the document is deleted {N} minutes after your last action."
  - Then one full-width zone (relative -mx-6 px-6 pb-12 md:pb-14) holds the rest. On every screen except /help: <nav aria-labelledby="footer-help-label" class="relative mx-auto flex max-w-3xl flex-col items-center text-center print:hidden">: eyebrow <p id="footer-help-label"> "OFFICIAL HELP" (flex items-center justify-center gap-4 text-xs font-semibold uppercase tracking-[0.18em] text-primary, a h-px w-8 bg-primary/70 rule each side); h2 "Official help you can contact" (mt-4 font-serif text-[1.75rem] font-medium leading-tight tracking-tight text-foreground md:text-[2.125rem]); line (mt-4 text-balance text-lg leading-relaxed text-muted-foreground) "Find official legal-aid services and helplines. Each listing shows when it was last checked. No document or upload is needed."; pill link-button → /help (mt-8 inline-flex min-h-[3.5rem] items-center justify-center gap-3 rounded-full border border-primary/50 bg-card py-2 pl-2.5 pr-6 text-base font-semibold text-primary shadow-sm hover:border-primary hover:bg-primary/5): a round badge (h-10 w-10 rounded-full bg-primary/10) with Phone h-5 w-5 stroke 1.75, the same words "Official help you can contact", then ArrowRight h-5 w-5.
  - Boundary block (relative mx-auto flex max-w-3xl flex-col items-center, mt-10 after the section): a h-px w-14 bg-border rule (mb-5 print:hidden) over the line (text-center text-sm leading-relaxed text-muted-foreground md:text-base): "ClauseCompass gives information, not legal advice."
  - When the margin beside the 48 rem column is 13 rem or more (about 1264 px at 100% text; the text-size control closes it) and the section is shown, the zone's margins carry decorations, each in a margin box that clips itself (overflow-hidden; nothing lengthens the page or reaches the words): LEFT an olive-branch cutout (w-[14rem] -rotate-[14deg], anchored past the page edge at the band's middle) with the handwritten line "More people. Fairer tomorrows." (font-hand text-[1.45rem] font-semibold text-foreground/70 -rotate-[9deg]) below and to its right; RIGHT a faint compass rose drawn inline in currentColor (text-foreground opacity-[0.11] dark:opacity-[0.14]; four long and four short two-tone points, a ring of ticks, N E S W in the serif, from footer.compassPoints) at the top corner and, at the bottom corner, a stack of cream note cards with a fountain pen (w-[15rem]) whose top card reads "INFORMATION SUPPORTS FAIRER DECISIONS." (font-serif uppercase tracking-[0.16em] text-[max(6.2cqw,8px)] in the fixed ink #1F2A3A, -rotate-[13deg], sized by the stack's own container). All aria-hidden, pointer-events-none, print:hidden; the two lines come from copy (footer.asideNote, footer.cardNote).

Buttons and links (recipes; "+ focusRing" = the string above):
  Primary, screen action (64px, Upload → Continue): inline-flex min-h-[64px] w-full max-w-sm items-center justify-center gap-3 rounded-2xl bg-primary px-8 text-xl font-semibold text-primary-foreground transition-colors hover:bg-primary/90 hover:shadow-lg aria-disabled:opacity-70 + focusRing
  Primary, interview (56px): inline-flex min-h-[56px] items-center gap-3 rounded-xl bg-primary px-6 text-lg font-semibold text-primary-foreground transition-colors hover:bg-primary/90 + focusRing, ArrowRight h-5 w-5
  Primary, continue link (48px): inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 + focusRing, arrow icon (ArrowLeft rotate-180); it sits in <div class="flex justify-end border-t border-border pt-8 print:hidden">
  Primary, medium (44px): inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-5 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 + focusRing
  Outline: inline-flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-border bg-background px-4 text-base font-medium text-foreground transition-colors hover:border-primary/60 + focusRing (variant px-5 font-semibold min-h-[48px] for the help entry and the packet download)
  Outline, primary: inline-flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-primary px-5 text-base font-semibold text-primary transition-colors hover:bg-primary/10 + focusRing
  Ghost: inline-flex min-h-[44px] items-center rounded-xl px-4 text-base font-medium text-muted-foreground transition-colors hover:text-foreground + focusRing
  Ghost, filled hover (disclosure toggles): inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-xl px-3 text-left text-base font-medium text-foreground transition-colors [overflow-wrap:anywhere] hover:bg-muted + focusRing
  Back link (header): -ml-3 inline-flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-md px-3 py-2 text-base font-medium text-muted-foreground transition-colors hover:text-foreground + focusRing, ArrowLeft h-5 w-5
  Underlined text link: inline-flex min-h-[44px] items-center gap-2 rounded-md px-3 text-base font-medium text-foreground underline decoration-primary/40 underline-offset-4 transition-colors hover:decoration-primary + focusRing
  Inline link (inside text): inline-flex items-center gap-1.5 rounded-sm font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary + focusRing; external links add target="_blank" rel="noopener noreferrer", ExternalLink h-5 w-5 and sr-only "(opens in a new tab)"
  Busy state: keep the label, swap the leading icon for LoaderCircle h-5 w-5 animate-spin motion-reduce:animate-none, set aria-disabled="true" and aria-describedby to a live status, change the label to the busy copy.

Cards and panels:
  Surface card: space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm (md:p-6 when it has body text)
  Interactive card (a <button>): w-full text-left group relative p-6 md:p-8 bg-card rounded-2xl border-2 border-border shadow-sm hover:border-primary/60 transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:border-primary
  Radio card (a <label>): flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-border bg-card p-4 md:p-5 transition-colors hover:border-primary/60 has-[:checked]:border-primary has-[:checked]:bg-primary/5 + the has-[:focus-visible] ring; native radio mt-1 h-5 w-5 shrink-0 accent-primary; label text block text-lg font-medium leading-snug text-foreground; description block text-base leading-relaxed text-muted-foreground
  Prompt card (page-coloured, so a source card inside it stands out): min-w-0 space-y-5 rounded-2xl border-2 border-border bg-background p-5 md:p-6
  Nothing-here card: min-w-0 space-y-3 rounded-2xl border-2 border-dashed border-border bg-muted p-5 md:p-6; title flex items-start gap-3 text-lg font-semibold text-foreground with FileQuestion / EyeOff / FileCheck2 mt-0.5 h-6 w-6 shrink-0 text-primary; body text-base leading-relaxed text-foreground/80
  Quiet panel: bg-muted border border-border/80 rounded-2xl p-6 md:p-8 space-y-5 shadow-sm — or the row form flex items-start gap-3 rounded-2xl border border-border bg-muted p-5 md:p-6
  Notice (primary tint): flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-base leading-relaxed text-foreground; icon mt-1 h-5 w-5 shrink-0 text-primary. Status notice variant: p-5 md:p-6, role="status", icon mt-0.5 h-6 w-6, title text-lg font-semibold text-foreground, body text-base leading-relaxed text-foreground/80.
  Alert (destructive tint): role="alert" space-y-4 rounded-2xl border-2 border-destructive/40 bg-destructive/5 p-5 md:p-6; title flex items-start gap-3 text-lg font-semibold text-foreground + AlertCircle mt-0.5 h-6 w-6 shrink-0 text-destructive; detail text-base leading-relaxed text-foreground/80; then ONE primary-medium button
  Inline error: role="alert" flex items-start gap-2 text-base font-medium text-destructive + AlertCircle h-5 w-5

Badges and pills:
  Family badge (non-interactive span): inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold + border-family-X/30 bg-family-X/10 text-family-X; icon h-4 w-4 shrink-0; sr-only prefix "Topic:". money → IndianRupee "Money" · time → CalendarClock "Dates and duration" · duty → ClipboardList "Duties and restrictions" · exit → DoorOpen "Ending and disputes" · data-ip → ShieldCheck "Information and data".
  Compare kind badge: same base; money/time/duty as above with labels "Money" / "Time" / "Duties"; remedy → Scale in family-exit colours "Remedies"; wording → Type with border-border bg-muted text-muted-foreground "Wording".
  Count pill: rounded-full border border-border bg-background px-3 py-1 text-sm font-medium, text "{label}: {count}".

Source card — the evidence unit. EVERY statement about the document is shown in one, or replaced by the withheld fallback:
  <article class="min-w-0 space-y-4 rounded-2xl border border-border/80 bg-card p-5 shadow-sm md:p-6"> (inside a prompt card: border-primary/30)
  1. optional uppercase topic label
  2. the claim (claim role, lang="en")
  3. only when flagged low-confidence: flex items-start gap-2 text-base text-foreground/80 + AlertTriangle mt-0.5 h-5 w-5 text-primary — "Weak match with the document. Read the source wording before relying on this."
  4. controls row flex flex-wrap items-center gap-x-5 gap-y-3: outline disclosure button "Show source" / "Show sources (n)" ↔ "Hide source" / "Hide sources (n)" with ChevronDown h-5 w-5 transition-transform motion-reduce:transition-none (rotate-180 open), aria-expanded, aria-controls, print:hidden; the Read-aloud button; location inline-flex items-center gap-2 text-base text-muted-foreground + FileText h-5 w-5, formatted "Clause 7.1 · Page 3, paragraph 27" / "Page 3, paragraph 27" / "Paragraph 27", plus "and 1 more" / "and n more"
  5. evidence panel space-y-5 border-l-4 border-primary/40 pl-4 md:pl-5 print:block (hidden when closed on screen, always printed): uppercase label "Exact wording from the document", then <ol class="space-y-5"> of <blockquote> in the quotation role, each followed by its location in the metadata role; if some cited passage could not be found: flex items-start gap-2 text-sm text-foreground/80 + AlertTriangle h-4 w-4 — "1 further cited passage could not be found in this document and is not shown." / "{n} further cited passages could not be found in this document and are not shown."
  Withheld fallback (not interactive): nothing-here card with EyeOff; title "Not shown: no verified source in your document"; a reason line, one of "This statement did not point to any passage of your document." / "The passages this statement pointed to could not be matched to your document." / "This statement arrived in a form ClauseCompass could not check."; then "ClauseCompass only shows statements it can trace to your document's own wording, so this one was withheld instead of being shown unverified."

Read-aloud button (render only when the browser supports speech): outline recipe + max-w-full text-left [overflow-wrap:anywhere] print:hidden; Volume2 "Read aloud" ↔ Square fill-current "Stop reading"; a role="status" line (basis-full text-sm text-foreground/80 print:hidden, sr-only unless it failed): "This browser could not start speech. Its voices may be switched off or not installed." Speech stops on navigation.

Analysis-screen chrome (Document map, Review prompts, Compare and Packet share it): page frame + header back link; h1 + lead; then a status region with aria-live="polite" that is exactly one of:
  - Analysing: surface card flex items-start gap-3 text-lg with LoaderCircle h-6 w-6 text-primary and the screen's analysing sentence.
  - Failure: alert card with the screen's failure title, the API's message as detail, and primary-medium "Try again"; when the session no longer exists, the button is "Upload the document again" (→ /upload). Generic messages: "Something went wrong on the way to ClauseCompass. Try again in a moment." / "ClauseCompass could not be reached. Try again in a moment."
  - Ready: document status card (space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm: one row per file flex items-center gap-3 with FileText h-6 w-6 shrink-0 text-primary, file name min-w-0 flex-1 truncate text-lg font-medium text-foreground and summary shrink-0 text-sm text-muted-foreground such as "PDF · 42 paragraphs · 3 pages"; then the screen's retention sentence in text-base leading-relaxed text-foreground/80), the screen body, and the continue link.

COPY RULES
All sentences in the screen blocks are the product's exact copy: use them verbatim, do not write new ones. Voice: plain, direct, second person, present tense, no exclamation marks, no marketing adjectives, no absolutes. Never phrase anything about a document as a verdict ("this clause is illegal/void"), a prediction ("you will win"), an entitlement ("you are entitled to"), an instruction ("you should sign/refuse") or a fairness judgement ("this is unfair"); prompts are questions or "ask/check/confirm" sentences. Document quotations are verbatim, serif, whitespace-pre-line — never shortened, translated, or highlighted (only Compare's word marks). Hinglish, if built, changes UI copy only; quotations, claims, prompt titles, why-it-matters lines and the packet stay English with lang="en".

ACCESSIBILITY — hard requirements
One h1 per screen, focused on arrival (the packet sheet has its own second h1); headings in order; landmarks main#main, header, footer, nav with an accessible name (aria-label, or aria-labelledby to the footer's visible eyebrow); section/article with aria-labelledby; fieldset/legend for grouped choices; real lists. Skip link is the first tab stop. Every journey completes with keyboard only; no focus traps; nothing opens on hover. Live regions: aria-live="polite" for progress, readouts, results headings and analysis status; role="alert" for errors; role="status" for confirmations; aria-live="assertive" only for a failed deletion. aria-pressed on toggles; aria-expanded + aria-controls on disclosures; aria-describedby from controls to hints and progress lines; aria-invalid on a failed input; aria-current="page" on a help link rendered on /help (the footer leaves its help section out there). Text contrast ≥ 4.5:1 (all tokens above satisfy it on the page colour); UI boundaries ≥ 3:1; state is always said in words (plus an icon), never by colour alone. html lang follows the display language.

DO NOT
Add colours, shadows, radii, font families or sizes outside this block · write hex/rgb in components · add sidebars, tab bars, modals, drawers, carousels, progress indicators or a second content column · use images, illustrations, emoji, gradients, patterns or entrance animations · put meaning in colour alone, hide content behind hover, or use placeholder text as a label · use the disabled attribute (except the noted case), remove focus rings, shrink a target below 44px, or trap focus · translate, paraphrase, shorten or highlight document quotations · show a statement without its source card or the withheld fallback · write user-facing sentences that are not in this spec · remove the boundary line · add a dark-mode toggle or a third language.
```

---

## Block 1 — Welcome (`/`)

```text
SCREEN 1 — WELCOME. Route "/". Build it with the shared frame and recipes from the project context.

Entry: while the safety escalation is active, this route redirects to /safety. Otherwise no guard.
Root div adds selection:bg-primary/20 selection:text-foreground. No back link. The header is a title block instead: <header class="w-full px-6 py-10 md:py-16 max-w-3xl mx-auto"> with h1 "ClauseCompass" (screen title role) and a tagline <p class="mt-3 text-xl text-muted-foreground"> "Plain-language navigation for legal documents."
Main: class flex-1 w-full px-6 pb-20 max-w-3xl mx-auto space-y-14 md:space-y-16. Top to bottom:

1. Deletion status — rendered ONLY right after "Delete my document now" was used (never on a plain visit). Status notice (role="status", focusable, ShieldCheck mt-0.5 h-6 w-6 text-primary), title "Your document has been deleted", body "The document's text and everything prepared from it are gone from ClauseCompass and from this browser's memory; anything you printed or downloaded stays with you. To start again, pick your situation below and upload the document once more."

2. Introduction (section aria-label="Introduction"): one paragraph, class text-xl md:text-2xl leading-relaxed font-serif text-foreground/90: "Bring the document that is worrying you. ClauseCompass explains what it says in plain language, shows you where it says that, and helps you prepare for a conversation with a lawyer or a legal-aid service."

3. Boundary panel: quiet panel (bg-muted border border-border/80 rounded-2xl p-6 md:p-8 space-y-5 shadow-sm), header row flex items-start md:items-center gap-3 with Info w-6 h-6 text-primary and h2 "Information, not legal advice" (text-xl font-semibold tracking-tight text-foreground); then <ul class="space-y-4"> of three bulleted points:
   • "ClauseCompass explains what a document says and points to the exact wording it came from. It does not tell you whether a clause is legal or fair, predict how a dispute will end, or decide what you are entitled to."
   • "It is not a lawyer and does not replace one. Use what it prepares to have a sharper conversation with a professional or an official legal-aid service such as NALSA or Tele Law."
   • "When something is not in the document, it says "not found in this document" instead of guessing."

4. Stage picker (section space-y-8 pt-4, aria-labelledby its heading): h2 in the sub-section heading role "What brings you here today?"; lead (text-lg md:text-xl text-muted-foreground) "Pick the moment you are in. It decides which clauses and dates the analysis looks at first."; then <ul class="grid gap-5" aria-label="Choose your situation"> with three interactive cards (each a <button> in an <li>). Inside a card: label (text-xl md:text-2xl font-serif font-medium text-foreground group-hover:text-primary), description (text-base md:text-lg text-muted-foreground leading-relaxed), example (text-sm md:text-base font-medium text-primary mt-2 block); if this stage was chosen in an earlier visit, a pill (inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-sm font-medium text-foreground + Check h-4 w-4) reading "Your earlier choice".
   a) "Before signing" — "An offer letter, rent agreement, NDA or loan you have been asked to sign. See what the document says you would be agreeing to, and what to ask before you do." — "For example: a first job offer, or an NDA a client has sent over."
   b) "A problem started" — "A dispute, notice or missed payment on an agreement you already signed. Find the wording that talks about it and build a dated timeline of what happened." — "For example: a landlord's message about leaving, or a deposit that has not come back."
   c) "Compare two versions" — "An old and a new version of terms, a policy or a contract. See what changed, clause by clause, in plain language." — "For example: a subscription's updated terms, or a renewal with changed rent or fees."
   Choosing a card saves the stage and navigates to /upload (a signed-out reader lands on /sign-in?next=/upload first, once — see Block 1a).

5. Official-help entry: a full-width tinted band (relative -mb-14 overflow-x-clip bg-secondary/60 py-14 md:-mb-20 md:py-16) that meets the footer, holding one card (mx-auto grid max-w-[66rem] gap-8 rounded-2xl border border-border/70 bg-card p-7 md:p-10 lg:grid-cols-[minmax(0,1.7fr)_1px_minmax(0,1fr)] lg:gap-8). Left half: round badge (h-[4.5rem] w-[4.5rem] rounded-full bg-secondary text-primary) with LifeBuoy h-9 w-9; h2 (font-serif text-3xl font-medium leading-tight tracking-tight md:text-[2.25rem]) "Need to reach a service now?"; body (text-lg leading-relaxed text-muted-foreground) "Official legal-aid services and helplines, each with the date it was last checked. No document or upload needed."; filled link-button (min-h-[3.5rem] rounded-xl bg-primary px-8 text-lg font-semibold text-primary-foreground) "See official help" + ArrowRight h-6 w-6 → /help. A 1px hairline column from lg. Right half: ul of three points, each a badge (h-11 w-11 rounded-full bg-secondary text-primary) with Phone / ShieldCheck / Users h-5 w-5, a serif title (text-lg font-medium leading-snug) and a line (text-[0.9375rem] leading-relaxed text-muted-foreground): "Official sources — Links to official legal-aid services and helplines.", "Last-checked dates — Know when each listing was last checked.", "No upload needed — See the contact details without uploading a document here."; below lg the list stacks under the button after border-t border-border/70 pt-7. When the page margin beside the card is 13 rem or more, decorative cutouts (aria-hidden, pointer-events-none, print:hidden) sit in the margins: a stack of books with a plant behind on the left; a soft disc, the handwritten line "Help today for a fairer tomorrow." and a brass balance on a stone block on the right.

Footer: shared footer; the delete block appears only if a session exists.
States to build: default · one card carrying "Your earlier choice" · the deletion status shown at the top.
```

---

## Block 1a — Sign in (`/sign-in`)

```text
SCREEN 1a — SIGN IN. Route "/sign-in". The gate in front of the document journey; the welcome, help, safety and not-found screens never show it.

Entry: redirects to /safety while escalated. A reader who is already signed in is sent straight on to `next`. `next` comes from the query string and is honoured only when it is one of /upload, /interview, /map, /review, /compare, /packet; anything else means /upload. While a persisted sign-in is still being restored the words and the points render but the card is empty (no form to press) until the reader is sent on or the form appears.
Header: the shared site header with the back link "Back to start" → "/" and NO account control (this screen is the account control).

Set like the welcome banner: the words on the left, the form in a card on the right, over the banner's desk photograph.
Main: class relative isolate flex flex-1 flex-col overflow-hidden. From md, behind everything: the banner photograph (hero-art-1024.webp, alt="", aria-hidden, absolute inset-0 -z-20 h-full w-full object-cover object-[50%_70%] saturate-[0.9]) under two washes at -z-10 — bg-gradient-to-r from-background/95 via-background/80 to-background/55, then bg-gradient-to-b from-background/60 via-transparent to-background/40 — so the desk fades towards the words and darkens with the theme. Below md the page is plain.
Margins on a wide screen (MarginAside beside="60rem" from="10rem", i.e. only when the margin is ≥ 10rem): LEFT, the banner's handwritten note "Complex documents. Simpler answers." with its small arrow (absolute left-[12%] top-[26rem] w-[78%] -rotate-[8deg] font-hand text-[max(13cqw,12px)] font-semibold leading-[1.12] text-foreground/80); RIGHT, a sticky note (absolute right-[14%] top-[7rem] aspect-square w-[8.5rem] rotate-[5deg] rounded-sm p-4 shadow-[0_14px_24px_-10px_rgba(31,42,58,0.35)], paper #F5E7B4 with ink #1F2A3A in both colour schemes) carrying "Understand today. Decide tomorrow." (font-hand text-[1.2rem] font-semibold leading-[1.15]).

Content grid: relative mx-auto grid w-full max-w-[36rem] flex-1 content-start gap-10 px-6 py-10 md:py-14 lg:max-w-[60rem] lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:gap-y-10 lg:py-16. One column (WORDS, CARD, POINTS in that order) up to lg; from lg WORDS = column 1 row 1, POINTS = column 1 row 2, CARD = column 2 across both rows.

WORDS — <header class="@container space-y-5">:
   • Eyebrow: <p class="flex items-center gap-3 text-[0.8125rem] font-semibold uppercase tracking-[0.18em] text-primary"> with an aria-hidden <span class="h-px w-9 shrink-0 bg-primary"> rule before the text.
   • h1: font-serif text-[clamp(2.25rem,11cqw,3.5rem)] font-medium leading-[1.08] tracking-tight text-foreground + focus ring, tabindex="-1" (a mode switch moves focus here).
   • Lead: <p class="max-w-[34rem] text-lg leading-relaxed text-muted-foreground">.
   All three by mode. SIGN IN: "Welcome to ClauseCompass" / "Sign in to open your document" / "ClauseCompass opens a document for the account that uploaded it, so it needs to know which account is yours. A Google account or an email and password will do." CREATE: "Create your account" / "A clearer understanding" + <span class="text-primary"> starts here.</span> (one heading, one sentence) / "An account is how ClauseCompass tells one reader's documents from another's. Create one with an email and a password, or continue with your Google account." RESET: "Forgot your password?" / "Get a reset link by email" / "Enter the email address of your account. A reset email brings a link to choose a new password; afterwards, sign in here as before."

CARD — <div class="rounded-3xl border border-border/70 bg-card/95 p-6 shadow-[0_28px_60px_-24px_rgba(31,42,58,0.38)] backdrop-blur-sm md:p-8">, inside <div class="space-y-6">, top to bottom:
1. Google button — <button type="button"> "Continue with Google", class inline-flex min-h-[56px] w-full items-center justify-center gap-3 rounded-2xl border-2 border-border bg-background px-6 text-lg font-semibold text-foreground transition-colors hover:border-primary/60 hover:bg-primary/5 aria-disabled:opacity-70 + focus ring, Google's four-colour "G" mark (inline SVG, h-6 w-6 shrink-0, aria-hidden) before the words.
2. Divider (aria-hidden): flex items-center gap-4, a <span class="h-px flex-1 bg-border"> on each side of "or with email" (text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground).
3. E-mail form (<form novalidate class="space-y-5">), in one of three modes: SIGN IN (default), CREATE ACCOUNT, RESET PASSWORD.
   Fields, in order: label (block text-lg font-medium text-foreground) + <div class="relative"> holding the icon (pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground, aria-hidden) and the input (block w-full rounded-2xl border-2 border-border bg-background py-3 pl-12 pr-4 text-lg leading-relaxed text-foreground transition-colors placeholder:text-muted-foreground/80 hover:border-primary/40 aria-[invalid=true]:border-destructive + focus ring):
   • "Email" — Mail icon; type="email", autocomplete="email", inputmode="email", placeholder "you@example.com".
   • "Password" — not in RESET mode; LockKeyhole icon; input also pr-14; placeholder "Enter your password" (SIGN IN) / "Create a password" (CREATE); autocomplete "current-password" (SIGN IN) or "new-password" (CREATE); in CREATE mode the hint "At least 6 characters." (text-base text-muted-foreground) sits under it and is linked by aria-describedby. At the field's end a show/hide toggle: <button type="button" aria-pressed aria-controls=<the input>> named "Show password" / "Hide password", class absolute right-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground + focus ring, Eye / EyeOff h-5 w-5; it switches the input between type="password" and type="text" and is reset by a mode switch.
   Submit: one primary block button (inline-flex min-h-[56px] w-full items-center justify-center gap-3 rounded-2xl bg-primary px-6 text-lg font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 hover:shadow-md aria-disabled:opacity-70 + focus ring, KeyRound h-6 w-6) reading "Sign in" / "Create account" / "Send reset email" by mode.
   Mode switches under the button — text buttons (inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-2 text-base font-medium text-primary underline underline-offset-4 transition-colors hover:text-primary/80 + focus ring): SIGN IN mode stacks "New here? Create an account" and "Forgot your password?" in <div class="flex flex-col items-start gap-y-0.5">; CREATE mode is one centred sentence <p class="flex flex-wrap items-center justify-center gap-x-1 text-center text-base text-muted-foreground"> "Already have an account?" followed by the button "Sign in" with ArrowRight h-4 w-4; RESET mode centres the button "Back to sign in". A switch clears the error and the reset notice, hides the password again, and moves focus to the h1 (which now names the new mode; the button pressed has left the page). The tab title follows the heading: CREATE "A clearer understanding starts here | ClauseCompass" (the full stop dropped), RESET "Get a reset link by email | ClauseCompass", SIGN IN the route's own "Sign in to open your document | ClauseCompass".
4. Closing note under a rule: <p class="flex items-start gap-3 border-t border-border/70 pt-5 text-base leading-relaxed text-muted-foreground"> with LockKeyhole mt-1 h-5 w-5 shrink-0 (aria-hidden): "Signing in does not change how long a document is kept. The document and everything prepared from it still end when you delete them, or when the retention window passes; the account only marks them as yours."

POINTS — <ul class="space-y-5">, each <li class="flex items-start gap-4">: an aria-hidden disc (flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary text-primary) with the icon (h-6 w-6, stroke 1.75), then a title (text-lg font-semibold leading-snug text-foreground) over one line (text-base leading-relaxed text-muted-foreground). SIGN IN and RESET: ShieldCheck "Your documents, under your account" / "Each opens for the account that uploaded it."; FileText "A simpler, clearer read" / "Each clause in plain words, with its source text beside it."; Users "Built for everyday people" / "Plain language. Brighter decisions." CREATE: FolderLock "One account, your documents" / "It is how ClauseCompass tells your documents from another reader's."; Lightbulb "Clear explanations" / "Plain words for every clause, with the source text beside them."; ShieldCheck "Kept only for a while" / "A document ends when you delete it, or when the retention window passes." Exactly three points per set (one icon each). Nothing here may promise safety, security, privacy, saved documents or "continue where you left off": each line is a thing the code does, and nothing is kept past the retention window.

Behaviour: one request at a time — while any request runs the Google and submit buttons read "One moment…" and every button, the mode switches included, is aria-disabled (never the disabled attribute, so focus stays); a further press or a mode switch in that time is ignored (a synchronous lock, not the rendered state, so a double press starts one request). On success the card's controls are replaced by <p role="status"> "Signed in. Taking you to your document…" and the screen navigates to `next`. Google sign-in opens a popup; a blocked popup is an error, not a redirect.

States to build:
• ERROR — one panel ABOVE the fields, role="alert", tabindex="-1", focused the moment it appears: flex items-start gap-3 rounded-2xl border-2 border-destructive/40 bg-destructive/[0.02] p-5 text-lg font-medium text-foreground + focus ring, AlertCircle mt-0.5 h-6 w-6 shrink-0 text-destructive. Submitting with an empty field marks that field aria-invalid="true" and the panel names it: "Enter the email address of your account." / "Enter your password." Provider failures use fixed sentences, one per reason (blocked popup: "The browser blocked the Google sign-in window. Allow pop-ups for this page, open ClauseCompass in its own tab, or sign in with email instead."; closed popup; address not authorised; provider not enabled; wrong password: "That email and password do not match an account here. Check them and try again, or reset your password."; no account; e-mail in use; weak password; bad e-mail; too many attempts; account disabled; offline; not configured; unknown: "Sign-in did not go through. Try again in a moment."). No sentence promises safety or security.
• RESET SENT — the same panel shape in the primary tint (border-primary/30 bg-primary/5, MailCheck mt-0.5 h-6 w-6 shrink-0 text-primary, role="status", focused): "A reset email is on its way to {email}. Open its link to choose a new password, then sign in here."
• DONE — the status line above, for the moment before the redirect.
Keyboard: Tab order is brand, back link, settings gear, Google, Email, Password, show/hide password, submit, the mode switches; Enter in a field submits. Every control ≥ 44 px, block buttons 56 px.
```

---

## Block 2 — Upload (`/upload`)

```text
SCREEN 2 — UPLOAD. Route "/upload".

Entry: redirects to /safety while escalated; to "/" when no stage was chosen; then to /sign-in?next=/upload while signed out (nothing renders while the persisted sign-in is being restored). Two variants: single document (stages "Before signing", "A problem started") and compare (two documents).
Header back link: "Change your situation" → "/".
Main: class flex-1 w-full space-y-16 py-12 md:py-16. Each block centres itself at its own width; two bands run full width so the pictures beside them can use the page margins — the same margin-decoration pattern as the welcome screen's help band (MarginAside: shown from lg once the margin is wide enough, aria-hidden, pointer-events-none, print:hidden, its words from copy and sized in container units). Top to bottom:

1. Session-ended notice — ONLY when the reader was sent here because the session expired, in a mx-auto max-w-4xl px-6 wrapper: flex items-start gap-4 rounded-3xl border border-primary/20 bg-card p-6 md:p-8 shadow-sm + the focus ring (role="status", tabindex=-1, focused on arrival), Clock h-6 w-6 text-primary in a h-12 w-12 rounded-full bg-primary/10 disc, title (text-xl font-semibold tracking-tight) "Your session ended", body "{N} minutes passed without activity, so ClauseCompass deleted the document's text and everything prepared from it, as the notice below says it will. The files you chose are still here: press Continue to upload again."

2. Title band (relative overflow-x-clip) holding a centred block (mx-auto max-w-3xl space-y-6 px-6 text-center): h1 (font-serif text-4xl font-medium leading-tight tracking-tight md:text-[3.5rem]) "Upload your document" (compare: "Upload both versions"); lead (text-balance text-xl leading-relaxed text-muted-foreground) "A PDF, DOCX or TXT file of up to 10 MB. Scans and photos cannot be read yet, so ask for a text version if that is all you have." (compare: "The older and the newer version, each a PDF, DOCX or TXT file of up to 10 MB. Scans and photos cannot be read yet."); then the situation pill (mt-2 inline-flex items-center gap-3 rounded-full border border-border/80 bg-card px-5 py-2.5 shadow-sm): "Your situation" in text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground, a h-5 w-px bg-border divider, the stage label in font-serif text-lg font-medium text-foreground. In the margins beside the block, on a margin of 10 rem or more: a handwritten line each side (font-hand font-semibold leading-[1.15] text-foreground/80, an 8 rem box, text-[max(19cqw,12px)], a thin primary-coloured stroke drawn under it) — left "Same documents. Clearer answers." rotated -12deg, right "Upload. Understand. Be prepared." rotated -10deg.

3. Form (noValidate, class space-y-16) — it opens with one band (relative space-y-8 overflow-x-clip) holding the document card and, under it, the retention notice. In that band's margins, on a margin of 13 rem or more: a plant low on the left (stage-leaf.webp, w-[24rem], rotated -20deg, opacity-90, blur-[1.5px], running off the page's edge) and on the right a stack of cream paper with a black-and-gold fountain pen (upload-papers.webp in a 17 rem box rotated 24deg, hanging 3 rem below the band) with the typed line "A fairer tomorrow begins with clearer information." on the top sheet (font-serif font-medium uppercase tracking-[0.12em] leading-[1.5], colour always ink #1F2A3A).
   a) Document card (mx-auto max-w-[73rem] px-6): <section aria-labelledby the documents heading> class grid gap-5 rounded-2xl border border-border/70 bg-card p-4 shadow-[0_28px_56px_-28px_rgba(31,42,58,0.28)] md:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)].
      Left column, from lg only (hidden below): the picture tile — aria-hidden, pointer-events-none, print:hidden, class rounded-xl bg-secondary/50 min-h-[22rem], a 4:3 scene (@container) centred vertically in it so that two stacked slots do not stretch the picture. In the scene: a bg-secondary disc (right-[6%] top-[8%], w-[62%]); the photograph upload-folder.webp (a brick-red folder with four cream sheets fanned out of it and two sprigs of leaves; left-[5%] top-[6%] w-[74%], drop shadow); the word "Contract" set on the front sheet (left-[44%] top-[23%] w-[26%], -rotate-[4deg], font-serif font-medium uppercase tracking-[0.14em], text-[max(3.4cqw,10px)], colour ink #1F2A3A); at bottom-[4%] right-[3%] w-[24%] the handwritten "Your document here" (font-hand font-semibold leading-[1.1] text-foreground/80, -rotate-[8deg], text-[max(4.6cqw,12px)]) with a short curved arrow in the primary colour towards the sheet.
      Right column (flex flex-col justify-center gap-5 p-2 md:p-4 lg:p-6): the h2 as an eyebrow (text-xs font-semibold uppercase tracking-[0.18em] text-primary) "Your document" — compare: "The two versions" — over <div class="grid gap-6"> holding the slot (compare: the two slots "Older version" and "Newer version", stacked).
   b) Retention notice (mx-auto max-w-[66rem] px-6): <section> class space-y-6 rounded-2xl border border-border/70 bg-card p-7 shadow-sm md:p-9; header row flex items-start gap-5 md:items-center with ShieldCheck h-6 w-6 (strokeWidth 1.75) in a h-12 w-12 rounded-full bg-secondary text-primary disc and h2 (font-serif text-2xl font-medium leading-snug tracking-tight text-foreground md:text-[1.75rem]) "Before you upload: how your document is handled"; <ul class="space-y-5 md:pl-[4.25rem]"> of three points (li flex gap-4 text-lg leading-relaxed text-foreground/80, each opened by an em dash "—" in text-xl font-bold text-primary/60, aria-hidden):
   • "Nothing leaves your browser until you press Continue. Choosing a file only reads it here, on your device."
   • "When you press Continue, ClauseCompass reads the document's text and keeps that text for this session only: the file itself is not stored. The text is deleted automatically {N} minutes after your last action, and you can delete it yourself at any time." (while the retention policy has not loaded: "…deleted automatically a short while after your last action, and…")
   • "To rephrase the document in plain language, passages of it are sent to an AI service; the whole file is not. ClauseCompass never uses your document to train anything."

   The notice stands under the file input and above the consent that refers to it: choosing a file sends nothing, pressing Continue does.
   Then, still in the form:
   c) Document slot (used in a above): wrapper space-y-3; slot name ("Your document" / "Older version" / "Newer version") as a span block text-lg font-medium text-foreground — visible only in the compare variant, sr-only in the single variant, where the section heading already names the slot. The native <input type="file"> is sr-only, labelled by the slot name + the action word, and is the only tab stop; the visual zone is its <label>. accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain".
      - Empty zone: group flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-border bg-card px-6 py-9 text-center transition-colors hover:border-primary/60 md:py-10 + the has-[:focus-visible] ring; while dragging over: border-primary bg-primary/5; invalid: border-destructive. Inside, top to bottom: a disc (flex h-20 w-20 items-center justify-center rounded-full bg-secondary text-primary) holding Upload h-9 w-9 strokeWidth 1.75, lifted -translate-y-1 scale-105 on hover and while dragging (transition-transform duration-500, none under reduced motion); prompt (text-base text-muted-foreground) "Drag a file here, or"; the action drawn as a filled button — a span, NOT a button: inline-flex min-h-[3.25rem] items-center justify-center rounded-xl bg-primary px-7 text-lg font-semibold text-primary-foreground shadow-sm transition-colors group-hover:bg-primary/90 — "Choose a file" (the sr-only input inside the label is what takes focus and opens the picker); hint (max-w-md text-sm leading-relaxed text-muted-foreground) "PDF, DOCX or TXT, up to 10 MB."
      - Chosen file (or sample): flex flex-col gap-4 rounded-2xl border-2 border-border bg-card p-5 shadow-sm transition-colors sm:flex-row sm:items-center; FileText h-8 w-8 text-primary; name truncate text-lg font-medium text-foreground (inside min-w-0); meta row flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground reading "PDF · 12.3 KB · Ready" (kind, aria-hidden dots, size, and a "Ready" span inline-flex items-center gap-1 font-medium text-foreground + Check h-4 w-4 text-primary); actions (flex shrink-0 flex-wrap gap-2): "Replace" — an outline <label htmlFor the same input>, and the one sr-only input now lives inside it — and "Remove" (ghost).
      - Invalid: zone border destructive, aria-invalid on the input, inline error under the slot (aria-describedby). Error texts: "This file is {size}. The limit is 10 MB. Try a smaller file, or export the document as text." · "This file is empty (0 bytes). Check that it downloaded fully, then try again." · ".{ext} files are not supported. Use a PDF, DOCX or TXT file." (no extension: "This file type is not supported. Use a PDF, DOCX or TXT file.") · ".doc files are not supported. Open the file in Word and save it as .docx or PDF." · "This looks like a photo or a scan. ClauseCompass cannot read those yet; ask for the document as a text PDF, DOCX or TXT file." · "This file is named .{ext} but its contents are not a document. Use a PDF, DOCX or TXT file." · "Drop one file at a time here." · "This file could not be read. Try choosing it again."
   d) Samples section (mx-auto max-w-4xl space-y-8 rounded-3xl border border-border/50 bg-muted/20 p-8 md:p-10, aria-labelledby): intro div space-y-3 max-w-2xl with h2 (text-2xl font-serif font-medium text-foreground) "No document handy? Try a sample" and lead (text-lg text-muted-foreground leading-relaxed) "Four made-up documents written for testing; the last is a revised draft of the rental agreement, for comparing versions. Every name, amount and date in them is fictional."; <ul class="grid gap-6 sm:grid-cols-2" aria-busy while loading> of four cards (flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm transition-colors hover:border-primary/30 hover:shadow-md): row flex items-start gap-4 with a tile flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 holding FileText h-5 w-5 text-primary, and h3 text-lg font-semibold text-foreground pt-1.5 (sample title); description flex-1 text-base text-muted-foreground leading-relaxed pl-14; then in a div pl-14 pt-2 the outline button "Use this sample" (inline-flex min-h-[44px] items-center justify-center rounded-xl border-2 border-border bg-background px-5 text-base font-semibold text-foreground transition-colors hover:border-primary/60 hover:text-primary disabled:opacity-50 disabled:pointer-events-none + focusRing; aria-labelledby button+title, aria-describedby description; all four carry the disabled attribute while one loads). Under the list a status line <p aria-live="polite">, sr-only until it has something to say: "Loading the sample "{title}"…" then "Loaded the sample "{title}" as your document." (compare: "…as the older version." / "…as the newer version.") in flex items-start gap-3 text-lg font-medium text-primary bg-primary/5 p-4 rounded-xl border border-primary/20; on failure the same line switches to flex items-start gap-3 text-lg font-medium text-destructive bg-destructive/5 p-4 rounded-xl border border-destructive/20 + AlertCircle mt-0.5 h-6 w-6 shrink-0 (still aria-live="polite", no role="alert") "The sample could not be loaded. Try again, or choose a file of your own."
   e) Consent (section mx-auto max-w-2xl space-y-8 border-t border-border/80 pt-12, aria-label "Consent"): a <div class="space-y-4"> holding one <label for="consent"> that is the whole row — flex items-start gap-5 cursor-pointer rounded-2xl border-2 p-6 transition-colors shadow-sm, border-border bg-card hover:border-primary/40 until ticked, border-primary bg-primary/[0.02] when ticked. Inside it, in a div relative flex items-center justify-center pt-1: the native <input type="checkbox" id="consent"> as peer sr-only, then an aria-hidden drawn box flex h-7 w-7 items-center justify-center rounded-md border-2 transition-colors peer-focus-visible:ring-4 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background — border-border bg-background, or border-primary bg-primary with Check h-5 w-5 text-primary-foreground when ticked; beside it the text (span text-xl text-foreground font-medium leading-relaxed) "I have read how my document is handled, and I want to continue."; role="alert" inline errors (flex items-start gap-3 text-lg font-medium text-destructive bg-destructive/5 p-4 rounded-xl border border-destructive/20 + AlertCircle mt-0.5 h-6 w-6 shrink-0): "Choose a document to continue." / "Add the older version to continue." / "Add the newer version to continue." / "Confirm you have read how your document is handled to continue."
   API failure (in the same section, above the button): <p role="alert" tabindex=-1> that receives focus, class flex items-start gap-3 rounded-2xl border-2 border-destructive/40 bg-destructive/[0.02] p-6 text-lg font-medium text-foreground + focusRing, AlertCircle mt-0.5 h-6 w-6 shrink-0 text-destructive.
   f) Continue, in a div flex flex-col items-center gap-4 pt-4: <button type="submit"> class inline-flex min-h-[64px] w-full max-w-sm items-center justify-center gap-3 rounded-2xl bg-primary px-8 text-xl font-semibold text-primary-foreground transition-colors hover:bg-primary/90 hover:shadow-lg aria-disabled:opacity-70 + focusRing — "Continue" + ArrowRight h-6 w-6; while uploading the label is "Reading your document…" after a LoaderCircle h-6 w-6 animate-spin motion-reduce:animate-none, aria-disabled="true", aria-describedby the progress line <p id="upload-progress" aria-live="polite"> (text-base font-medium text-primary while uploading, sr-only otherwise) "Your file is being sent to ClauseCompass and its text read. This usually takes a few seconds."

States to build: empty · drag-over · file chosen · invalid file (each error) · sample loading · uploading · missing file / missing consent on press (error shown and focus moved to the file input or the checkbox) · API failure (role="alert" inline error that receives focus) · session-ended notice at the top · compare variant with two slots.
Behaviour: type is checked before size; nothing is sent until Continue; Continue opens the session and goes to /interview.
```

---

## Block 3 — Interview (`/interview`)

```text
SCREEN 3 — INTERVIEW. Route "/interview".

Entry: redirects to /safety while escalated, to "/" without a stage, to /sign-in?next=/interview while signed out, to /upload without the stage's documents or without an API session (e.g. after the session expired).
Header back link: "Back to upload" → /upload.
Main: class flex-1 w-full px-6 pb-20 max-w-3xl mx-auto space-y-10. Top to bottom:

1. Title block: h1 "Next: a few quick questions" (no lead).
2. Ready list (section space-y-4): h2 (text-base font-medium text-muted-foreground) "Ready to analyse"; one row per uploaded file: flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm with FileText h-6 w-6 shrink-0 text-primary, file name (min-w-0 flex-1 truncate text-lg font-medium text-foreground) and, right-aligned in shrink-0 text-sm text-muted-foreground, the size — in the compare variant prefixed with the slot name: "Older version · 12.3 KB".
3. Status paragraph (text-lg text-muted-foreground leading-relaxed max-w-prose): "The rest of the questions step is being built next. ClauseCompass has read your document's text and keeps it for this session: it is deleted {N} minutes after your last action, or as soon as you press "Delete my document now" below. Nothing has gone to an AI model yet."
4. Form (noValidate, space-y-10):
   a) The one question (section space-y-4): <label> in the question role (block text-2xl md:text-3xl font-serif font-medium text-foreground) "Before the document: is there anything about your situation to say first?"; hint (text-base leading-relaxed text-muted-foreground max-w-prose, id referenced by aria-describedby) "Optional. A sentence or two in your own words, in English or Hinglish. ClauseCompass reads it here, in your browser, to decide which screen comes next: when it mentions harm to a person, official help comes before the document. The words are not sent to ClauseCompass or to any AI model, and they are not kept when you leave this screen."; textarea class block w-full rounded-2xl border-2 border-border bg-card px-4 py-3 text-lg leading-relaxed text-foreground shadow-sm placeholder:text-muted-foreground/70 + focusRing, rows=4, maxLength=1000, autoComplete="off", no placeholder text as label. There is no multiple-choice question UI.
   b) Sample answers (space-y-3 pt-2): h3 (text-base font-semibold text-foreground) "Try a sample answer"; lead (max-w-prose text-base text-muted-foreground) "Written for the demo: none of them is a real person's words. Choosing one fills the box; nothing happens until you press Continue."; <ul class="flex flex-wrap gap-2" aria-label="Try a sample answer"> of outline buttons, each MessageSquareText h-4 w-4 text-primary + the sample's title, aria-label "Use this answer: {title}"; a status line (aria-live="polite"; text-base font-medium text-foreground when filled, sr-only otherwise) "The sample answer “{title}” is in the box. Press Continue to go on." (curly quotes).
   c) Actions, each in its own <div class="space-y-3">: primary interview button (56px) "Continue to the document map" + ArrowRight; note under it (max-w-prose text-base leading-relaxed text-muted-foreground) "Pressing this sends passages of your document to the AI model to prepare the map." (compare stage: "…passages of the newer version to the AI model…"). In the compare stage a second, outline-primary button follows: "Or go straight to what changed between the versions" with its note "Pressing this lines up the two versions on ClauseCompass. No AI model is involved in that step."

Behaviour: the answer never leaves the browser. On Continue a local safety scan runs; if it finds a cue of force or harm to a person, the app goes to /safety instead of /map (or /compare). The typed text is discarded on leaving the screen and never shown again.
States to build: empty · text entered · sample answer inserted (status announced) · compare variant with two buttons.
```

---

## Block 4 — Safety (`/safety`)

```text
SCREEN 4 — SAFETY. Route "/safety". Shown only while the safety escalation is active; otherwise redirects to "/". While it is active every other route except /help redirects here.

No back link. Nothing the reader typed is displayed. No upload or analysis path from here.
Header: <header class="w-full max-w-3xl mx-auto px-6 pt-10 md:pt-16"> with h1 "Your safety comes first" (screen title role, tabindex=-1, focused on arrival, rounded-md focus ring).
Main: class mx-auto w-full max-w-3xl flex-1 space-y-12 px-6 py-10 md:py-12. Top to bottom:

1. Emergency panel: space-y-6 rounded-3xl border-2 border-primary bg-primary/5 p-6 shadow-sm md:p-8. Header row flex items-start gap-3 with Siren h-7 w-7 shrink-0 text-primary and h2 (font-serif text-3xl font-medium leading-tight text-foreground md:text-4xl) — one of: "If you are in danger now" · "If someone is forcing or holding you" · "If a child is at risk" · "If you are thinking of ending your life". Body (max-w-prose text-lg leading-relaxed text-foreground md:text-xl) — the matching one:
   • danger: "You wrote about a threat or violence. ClauseCompass stops here when that comes up: the police and the emergency services can act on it, and a document can wait."
   • coercion: "You wrote about being forced, held or threatened into something. ClauseCompass stops here when that comes up: the police and the emergency services can act on it, and a document can wait."
   • child at risk: "You wrote about a child who may be at risk. ClauseCompass stops here when that comes up: the Child Helpline and the emergency services can act on it, and a document can wait."
   • self-harm: "You wrote about not wanting to live. If that is how you feel right now, talking to someone comes before any document: the helpline below is free and answered by a counsellor, and the emergency number is there too."
   Call buttons: <ul class="flex flex-col gap-4" aria-label="{service name}">, one <li class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4"> per number: <a href="tel:…"> class inline-flex min-h-[64px] items-center justify-center gap-3 whitespace-nowrap rounded-2xl bg-primary px-6 text-2xl font-semibold tabular-nums text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 md:px-8 md:text-3xl + focusRing, Phone hidden h-7 w-7 shrink-0 sm:block, label "Call 112" (numbers come from the official resource registry for that category; never invent one); beside it a caption (text-base leading-snug text-foreground md:text-lg) naming the service, with any note in text-muted-foreground in brackets.

2. "Why you are seeing this" (section space-y-3; h2 sub-section heading), body (max-w-prose text-base leading-relaxed text-foreground/90 md:text-lg): "ClauseCompass read your answer here, in your browser, and it mentioned harm to a person. It treats that as coming before any document, so it did not go on to the analysis. Nothing you typed was sent anywhere, and the words were not kept." then, in max-w-prose text-base leading-relaxed text-muted-foreground: "If this does not describe your situation, you can start again from the beginning below; the document would need to be uploaded once more."

3. "Who can act on this" (section space-y-6; h2 sub-section heading): first the links note (max-w-prose text-base text-muted-foreground) "Links open in a new tab, so anything you have prepared here stays open. Phone numbers open your phone's dialler.", then the resource cards for that category (recipe in Block 9).

4. More help: outline-primary link (inline-flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-primary px-5 text-base font-semibold text-primary transition-colors hover:bg-primary/10 + focusRing) "All official help for safety, including free legal aid" + ArrowRight h-5 w-5 → /help?concern=safety.

5. "Your document" quiet panel (row form, ShieldCheck h-6 w-6 text-primary; heading text-lg font-semibold "Your document"): "ClauseCompass has not analysed it from here and will not." followed — only while the escalation that set the document aside is still in memory; after a page refresh the sentence stands alone — by the deletion status, one of: "The text it had read for this session is being deleted, along with anything prepared from it." · "The text it had read for this session has been deleted, along with anything prepared from it." · "ClauseCompass asked for the text it had read for this session to be deleted, but could not confirm that just now. The server deletes it on its own {N} minutes after your last action, and nothing is analysed in the meantime."

6. Start again: underlined text link in text-muted-foreground hover:text-foreground + RotateCcw h-5 w-5 — "Start again from the beginning" → clears the escalation and the session, goes to "/".

Footer: shared footer WITHOUT the delete block (the document is already being deleted).
States to build: the four categories · deletion in progress / done / unconfirmed · after refresh (no deletion status).
```

---

## Block 5 — Document map (`/map`)

```text
SCREEN 5 — DOCUMENT MAP. Route "/map". Uses the analysis-screen chrome from the project context.

Entry guards: /safety while escalated; "/" without a stage; /sign-in?next=<this path> while signed out; /upload without documents or without an API session.
Header back link: "Back to the questions" → /interview.
h1 "Your document map"; lead "What the document says on six points, in plain language. Every statement shows the exact wording it rests on; when a point is not in the document, it says so."

Status region (aria-live="polite"), one of:
- Analysing card: "Reading {file name} and preparing the map. This usually takes a few seconds."
- Failure alert: title "The map could not be prepared", API message, "Try again" (or "Upload the document again" when the session is gone).
- Ready, in this order:
  1. Document status card: FileText, file name, summary metadata (e.g. "PDF · 42 paragraphs · 3 pages"), and the retention sentence "This map was prepared from the text of {file name} held in your session; the passages it rests on were sent to the AI model. ClauseCompass deletes that text and this map when the session ends: when you delete it, or on its own after the time stated on the upload screen."
  2. Read-aloud row (flex flex-wrap justify-end gap-3): Read-aloud button labelled "Read the whole map aloud".
  3. Six field sections in this exact order, each <section class="space-y-5" aria-labelledby>: h2 section heading, description (max-w-prose text-base leading-relaxed text-muted-foreground), then the content:
     • "Who is bound by it" — "The parties to the document and the role each one plays."
     • "How long it lasts" — "When it starts and ends, deadlines, and what a renewal or extension needs."
     • "Money" — "What has to be paid, when, deposits and how they come back, and any fee or penalty."
     • "Duties and restrictions" — "What each side must do, must not do, and what one side may decide alone."
     • "How it can end" — "Who can end it, with how much notice, any lock-in, and what happens on ending."
     • "If there is a dispute" — "Which law applies, which courts or authority decide, and whether it provides for arbitration."
     Content is one of: (a) source cards in a space-y-4 stack; (b) wording-only: a primary notice with Quote icon — bold "Shown in the document's own words." followed by one reason: "The plain-language rephrasing service was unavailable, so the passages ClauseCompass located are shown exactly as written instead." or "None of the plain-language rephrasings could be verified against the document, so the passages ClauseCompass located are shown exactly as written instead." — above ordinary source cards whose statements are the located passages exactly as written; (c) the nothing-here card with FileQuestion: title "Not found in this document", body "ClauseCompass looked for {what it looked for} and found none. The document may still cover this in words it does not recognise, so if you expected it here, ask about it rather than assuming the document is silent."
     After a section, when statements were dropped: a line (text-base leading-relaxed text-foreground/80) "1 further statement was withheld because it could not be verified against the document." / "{n} further statements were withheld…".
  4. Timeline (section space-y-6): h2 section heading "Dates in this document"; lead "Every full date the document writes out, in order, with the sentence it appears in. Recurring days such as "the 5th of every month" are under Money, not here."; <ol class="space-y-8"> of date groups: h3 flex items-center gap-3 text-xl font-semibold text-foreground + CalendarDays h-6 w-6 text-primary showing the date, then <ul class="space-y-4 md:pl-9"> of source cards (topic label = the entry's first two topics, or "Date"). An uncertain date puts a primary notice (AlertTriangle mt-1 h-5 w-5) above its source card, one paragraph: bold "Uncertain date." then "Written as "{text}"." then the explanation — "Could also mean {other date}: the document does not say which number is the day and which the month." and/or "The year is written with two digits and is read as a 20xx year." — then "Check before relying on it." Empty: nothing-here card with FileQuestion and the title "No full dates found in this document" only (no body).
  5. Continue link "Continue to the review prompts" → /review.

Footer: shared footer with the delete block.
States to build: analysing · failure · session gone · ready with all three content kinds visible somewhere · a withheld line · timeline with an uncertain date · empty timeline.
```

---

## Block 6 — Review prompts (`/review`)

```text
SCREEN 6 — REVIEW PROMPTS. Route "/review". Analysis-screen chrome.

Entry guards as Block 5. Header back link: "Back to the document map" → /map.
h1 "Your review prompts"; lead "The clauses in this document that are worth a closer look at this moment, each with the question to put to the other side or to an adviser. Every prompt shows the wording it rests on."

Status region: analysing card "Reading {file name} and preparing the review prompts. This usually takes a few seconds."; failure alert titled "The review prompts could not be prepared"; or Ready:
  1. Document status card (as Block 5, with the sentence "These prompts were prepared from the text of {file name} held in your session; the passages they rest on were sent to the AI model. ClauseCompass deletes that text and these prompts when the session ends: when you delete it, or on its own after the time stated on the upload screen.")
  2. Read-aloud row: "Read all the prompts aloud".
  3. Groups, only the non-empty ones, in this order, each <section class="space-y-5"> with h2 section heading, description (muted body), and prompt cards in a space-y-5 stack:
     • "Check first" — "The clauses that matter most at this moment. Read each one and ask the question before you decide."
     • "Also worth checking" — "Clauses that usually matter less right now but are in this document."
     • "Other clauses found" — "Found in the document; the prompt for each is the standard check for that kind of clause."
     Review prompt card = prompt card recipe (min-w-0 space-y-5 rounded-2xl border-2 border-border bg-background p-5 md:p-6) containing, in order:
       - heading block space-y-3: family badge → h3 in the card-title role, lang="en", the clause's name from the rule registry (e.g. "Deposit, its refund and deductions") → why-it-matters (max-w-prose text-base leading-relaxed text-muted-foreground, lang="en", e.g. "The headline figure and its due date are the terms you will feel every month.")
       - when the prompt is the standard check rather than a model phrasing: primary notice with ClipboardCheck mt-1 h-5 w-5 — bold "Standard check for this kind of clause." followed by one reason: "The plain-language rephrasing service was unavailable, so this prompt is the standard one for this kind of clause rather than one written for this document." / "The plain-language rephrasing for this clause could not be verified against the document, so this prompt is the standard one for this kind of clause instead." / "This clause is not among the ones that lead at this moment, so it was not sent for rephrasing; this prompt is the standard one for this kind of clause."
       - the source card (border-primary/30 variant): its statement is the prompt itself — the question to put to the other side or an adviser — with the clause wording as evidence
       - "Places": uppercase label row (text-sm font-semibold uppercase tracking-wide text-muted-foreground + FileText h-4 w-4) reading "Found in 1 place" / "Found in {n} places"; the first two places open, the rest behind a ghost-filled-hover toggle (-ml-3 print:hidden) "Show 1 more place" / "Show {n} more places" ↔ "Show fewer places". Each place: <li class="space-y-2 border-l-4 border-border pl-4"> location (metadata), the sentence (font-serif text-base leading-relaxed text-foreground md:text-lg), and — only when the paragraph says more than the sentence — a paragraph toggle (ghost-filled-hover variant -ml-3 min-h-[40px] text-sm print:hidden, ChevronDown h-4 w-4) "Show the paragraph" ↔ "Hide the paragraph" revealing the whole paragraph in whitespace-pre-line rounded-xl bg-muted p-4 font-serif text-base leading-relaxed text-foreground print:block.
  4. Withheld note when rephrasings were dropped (text-base leading-relaxed text-foreground/80): "1 rephrasing was withheld because it could not be verified against the clause it was written for; the standard prompt is shown in its place." / "{n} rephrasings were withheld … in each place."
  5. "Not found in this document" section: h2 section heading; description "Clauses that often matter at this moment and that ClauseCompass looked for without finding. The document may still cover them in words it does not recognise, so if you expected one, ask about it rather than assuming the document is silent."; <ul class="grid gap-3 sm:grid-cols-2"> of dashed items (flex min-w-0 flex-col gap-2 rounded-2xl border-2 border-dashed border-border bg-muted p-4) each with a family badge and the clause kind name (text-base font-medium text-foreground [overflow-wrap:anywhere]).
  6. If there are no prompts at all: the read-aloud row and the groups are omitted; the body is the nothing-here card followed by the "Not found in this document" section. Card: "No review prompts for this document" — "ClauseCompass found none of the clauses it looks for. That does not mean there is nothing to ask about; it means the document uses words it does not recognise. Read it with an adviser."
  7. Continue link: "Continue to what changed" → /compare in the compare stage, otherwise "Continue to your preparation packet" → /packet.

States to build: analysing · failure · ready with three groups · a standard-check card · a card with 4+ places (toggle) · an expanded paragraph · withheld note · not-found grid · empty state.
```

---

## Block 6a — Ask about this document (`/ask`)

```text
SCREEN 6a — ASK ABOUT THIS DOCUMENT. Route "/ask". Page frame as the analysis screens (main mx-auto w-full max-w-3xl flex-1 space-y-12 px-6 py-12 md:py-16). An aside: reached from the outline link "Ask about this document" (MessageCircleQuestion h-5 w-5; inline-flex min-h-[56px] items-center gap-3 rounded-2xl border-2 border-primary bg-card px-6 text-lg font-semibold text-primary transition-colors hover:bg-primary/10) that sits before the continue link on the map, review and compare screens.

Entry guards as Block 5. Header back link: "Back to the document map" → /map.
Heading block space-y-5: h1 "Ask about this document"; lead "Type a question in English or Hinglish. ClauseCompass answers with what the document itself states, each statement resting on the exact wording, or says that the document does not answer it. It does not guess, and it does not say what to do."; document line flex items-center gap-3 text-base text-muted-foreground with FileQuestion h-5 w-5 shrink-0 text-primary and the file name (min-w-0 truncate font-medium text-foreground).

Question form (<form noValidate class="space-y-8">) holding one surface card (rounded-3xl border border-border/80 bg-card p-6 shadow-sm md:p-8, space-y-5), a <section> labelled by its own <label>:
  1. <label> "Your question" in the card-title role (font-serif text-2xl font-medium text-foreground md:text-3xl), for the textarea.
  2. Hint (max-w-prose text-base leading-relaxed text-muted-foreground, wired by aria-describedby): "Up to 500 characters. Your words are read here in your browser first (a mention of harm to a person brings up official help), then sent to the AI model together with the paragraphs of the document that share their words, and nothing else. Your question is not kept once the answer is back; the document itself stays in your session until it ends, as the upload screen states."
  3. <textarea rows="3" maxLength="500" autoComplete="off"> block w-full rounded-2xl border-2 border-border bg-background px-4 py-3 text-lg leading-relaxed text-foreground transition-colors hover:border-primary/40 + focus ring.
  4. Action row flex flex-wrap items-center gap-4: submit button "Ask" (inline-flex min-h-[56px] items-center gap-3 rounded-2xl bg-primary px-8 text-lg font-semibold text-primary-foreground shadow-md transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60; Send h-5 w-5; disabled and aria-disabled while the field is empty or a question is in flight) and the counter "{n}/500" (text-sm text-muted-foreground).
  5. Sample questions under a border-t border-border/60 pt-6 rule: h2 "Or try one of these" (text-base font-semibold text-foreground); <ul class="flex flex-wrap gap-2"> of chips (inline-flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-border bg-background px-4 text-left text-base font-medium text-foreground transition-colors [overflow-wrap:anywhere] hover:border-primary/60 hover:bg-primary/5; MessageSquareText h-4 w-4 text-primary; aria-label "Ask this question: {sample}"): "What is the notice period?" · "When is the deposit returned?" · "Which court handles disputes?" · "Can I work for a competitor after leaving?". A chip fills the textarea and focuses it; a polite live line (sr-only until a chip is used, then text-base font-medium text-foreground) repeats the chosen question.

Thread section (space-y-6, aria-labelledby its h2): h2 "Your questions" (text-sm font-bold uppercase tracking-widest text-muted-foreground); note (max-w-prose text-base leading-relaxed text-muted-foreground) "Each question is answered on its own from the document. The questions and answers stay in this browser while this screen is open, and nowhere else."; <ol aria-live="polite" class="space-y-8"> of exchange cards, one per question asked on this visit, newest last; component state only, so a refresh empties it.

Exchange card = <li> surface card + space-y-6, aria-labelledby its question: eyebrow "You asked" (text-sm font-bold uppercase tracking-widest text-muted-foreground); the question (font-serif text-2xl font-medium text-foreground [overflow-wrap:anywhere]); then one body:
  • asking — flex items-center gap-4 rounded-2xl border border-primary/20 bg-background p-5; LoaderCircle h-8 w-8 shrink-0 animate-spin text-primary motion-reduce:animate-none; "Reading the document for an answer. This usually takes a few seconds." (text-lg text-foreground).
  • failed — role="alert" space-y-5 rounded-2xl border-2 border-destructive/30 bg-destructive/[0.02] p-5; AlertCircle mt-1 h-6 w-6 shrink-0 text-destructive; title "The question could not be answered" (text-xl font-medium text-foreground); the API's own sentence (text-lg text-foreground/80); then the button "Ask again" (inline-flex min-h-[48px] items-center gap-2 rounded-2xl border-2 border-primary bg-card px-6 text-base font-semibold text-primary transition-colors hover:bg-primary/10; RotateCcw h-5 w-5) — or, when the session is gone, the "Upload the document again" link instead.
  • answered — header row flex flex-wrap items-center justify-between gap-4: h3 "What the document states" (text-xl font-semibold text-foreground) and the read-aloud button "Read the answer aloud"; in the brief style a note (max-w-prose text-base leading-relaxed text-muted-foreground) "One statement, because your deadline is close: the one the document supports best."; <ul class="space-y-4"> of source cards, one per statement, the first open; when statements were dropped, "1 further statement was withheld because it could not be verified against the document's wording." / "{n} further statements were withheld because they could not be verified against the document's wording."
  • not in document — h3 "The document does not answer this" (text-xl font-semibold text-foreground); one reason (max-w-prose text-lg leading-relaxed text-foreground/80): "No paragraph of the document shares the words of your question, so nothing was sent to the AI model." / "The paragraphs that share its words were read, and no statement about them could be verified against the document's own wording." / "The paragraphs that share its words were read, and the only statements found were weakly supported, so none is shown."; then a panel space-y-3 rounded-2xl border border-border/80 bg-background p-5: "The question, as it stands, for a lawyer or a legal-aid service:" (text-base font-semibold text-foreground), the question as <blockquote class="border-l-4 border-primary/40 pl-4 font-serif text-xl text-foreground [overflow-wrap:anywhere]">, and the link "Official help you can contact" (inline-flex min-h-[44px] items-center text-base font-semibold text-primary underline-offset-4 hover:underline) to /help for legal advice.

Behaviour: submit runs the words through the decision flow first (a safety cue replaces this screen with /safety, no request sent); one question in flight at a time; after a submit the field clears and keeps focus; answers are in English under both language settings; nothing typed here is stored anywhere.

States to build: empty (no questions yet) · asking · answered with three statements · answered brief with one statement and the note · a withheld line · not in document, each of the three reasons · failed with "Ask again" · failed with the session gone.
```

---

## Block 7 — Compare (`/compare`)

```text
SCREEN 7 — COMPARE. Route "/compare". Analysis-screen chrome. Compare stage only (other stages redirect to /map). No AI model is involved.

Header back link: "Back to the review prompts" → /review.
h1 "What changed between the versions"; lead "Each paragraph of the newer version set against the older one. Where the wording differs, both versions are shown side by side with the changed words marked, and each change is sorted by what it touches: money, time, duties, remedies, or wording only."

Status region: analysing card "Reading {older name} and {newer name} and lining up the two versions. This usually takes a few seconds."; failure alert "The versions could not be compared"; or Ready:
  1. Document status card naming both files, sentence "The two versions were lined up from the text of {names} held in your session. No AI model takes part in this comparison. ClauseCompass deletes that text and this comparison when the session ends: when you delete it, or on its own after the time stated on the upload screen."
  2. Summary card (surface card): h2 card-title role "In brief"; count line text-lg font-semibold "{n} changes" (or "1 change"); <ul class="flex flex-wrap gap-2"> of count pills (text-foreground) "Money: 2", "Time: 1", "Duties: 3", "Remedies: 1", "Wording: 4"; muted body line "{n} paragraphs the same" and, when relevant, "{n} paragraphs added" / "{n} paragraphs removed".
  3. Change cards, one per change, in document order. Change card = prompt card recipe containing:
     - header flex flex-wrap items-center gap-x-3 gap-y-2: first the kind badge (sr-only prefix "Change to:"): Money / Time / Duties / Remedies / Wording — then the status as h3 (text-lg font-semibold text-foreground): "Changed" / "Added in the newer version" / "Removed in the newer version".
     - excerpts grid gap-4 md:grid-cols-2; each side: uppercase caption "Older version" / "Newer version", location in the metadata role, then the quote box rounded-xl border p-4 text-base leading-relaxed text-foreground [overflow-wrap:anywhere] — older: border-border bg-muted/60; newer: border-primary/30 bg-primary/5. These excerpts are sans (not serif) because they carry inline marks. An absent side shows a dashed muted paragraph (rounded-xl border-2 border-dashed border-border bg-muted p-4 text-base leading-relaxed text-muted-foreground) "This paragraph is not in the older version." / "This paragraph is not in the newer version."
     - word marks inside the excerpts: removed words <del class="rounded-sm bg-destructive/15 px-0.5 text-foreground decoration-destructive/70 decoration-2"> with sr-only "removed: "; added words <ins class="rounded-sm bg-family-money/20 px-0.5 font-medium text-foreground decoration-family-money decoration-2 underline-offset-2"> with sr-only "added: ". When a whole paragraph was added or removed the mark keeps its tint but adds no-underline.
     - key terms, only when there are any: one paragraph text-base leading-relaxed text-foreground — bold "Key terms" then " — " then "older version: {terms}; newer version: {terms}" (a side with no extracted terms is left out, so the line may name one side only).
     - what to check (max-w-prose text-base leading-relaxed text-muted-foreground), by kind, with "Also touches Time, Duties." appended to the same paragraph when other kinds are touched:
       Money: "This touches an amount, a fee, or a percentage. Check the figures against what was agreed, and whether anything else in the document is worked out from them."
       Time: "This touches a date, a period, or a deadline. Work out what the newer version gives you or takes away, and by when."
       Duties: "This touches who must do what, or what is allowed. Check which side the newer wording binds, and whether a permission or a consent step has gone."
       Remedies: "This touches what follows when something goes wrong: a right to end, deduct, forfeit, or claim. Read the consequence in the newer version in full before you accept it."
       Wording: "The words differ, but none of the amounts, dates, duties, or remedies ClauseCompass looks for changed. Read it once to see whether the meaning is the same."
  4. No differences (replaces the summary and the cards; the note below is not shown): nothing-here card with FileCheck2 — "No differences found" — "The two files read the same, paragraph for paragraph, apart from capitalisation and quote marks. If you expected changes, check that these are the two versions you meant to compare." — then a muted line "{n} paragraphs the same".
  5. Note after the cards (max-w-prose text-base leading-relaxed text-muted-foreground): "Paragraphs are matched in order, so a clause that moved to another place in the document appears once as removed and once as added. The sorting comes from the words that changed, not from reading the whole clause; treat it as a first pass, and read each card in full."
  6. Continue link "Continue to your preparation packet" → /packet.

States to build: analysing · failure · ready with changed / added / removed cards and all five kinds · no differences.
```

---

## Block 8 — Preparation packet (`/packet`)

```text
SCREEN 8 — PREPARATION PACKET. Route "/packet". Analysis-screen chrome, print-aware.

Header back link: "Back to what changed" → /compare in the compare stage, otherwise "Back to the review prompts" → /review.
h1 "Your preparation packet"; lead "Everything ClauseCompass prepared for this document, in one place you can print, save as a PDF or download as text: what it says, its dates, the questions to ask, the records to gather, and the exact wording behind each statement."
Main adds print:max-w-none print:space-y-0 print:p-0; everything except the sheet carries print:hidden.

Status region: analysing card "Reading {file name} and preparing the packet. This usually takes a few seconds."; failure alert "The packet could not be prepared"; or Ready (body space-y-6):
  1. Document status card with the sentence "This packet is built from the map and the review prompts prepared for {file name} in your session; the passages they rest on went to the AI model when those were prepared. ClauseCompass deletes the text and everything prepared from it when the session ends: when you delete it, or on its own after the time stated on the upload screen. Print or download the packet before then if you want to keep it; a copy you save is yours to keep or discard."
  2. Actions (space-y-3 print:hidden): row flex flex-wrap gap-3 with primary packet-action button "Print or save as PDF" + Printer h-5 w-5 (calls window.print) and outline (min-h-[48px] px-5 font-semibold) "Download as a text file" + Download h-5 w-5; hint (text-sm text-muted-foreground) "Opens your browser's print dialog; choose "Save as PDF" there to keep a copy."; an sr-only skip link "Skip past the packet" that targets the sentinel after the sheet ("End of the packet").
  3. The sheet — a fixed-English document that ignores the theme (on screen it still scales with the text-size setting; print resets html font-size to 100%):
     <article class="mx-auto w-full max-w-3xl bg-white px-6 py-8 font-sans text-neutral-900 shadow-md ring-1 ring-neutral-200 md:px-12 md:py-12 print:max-w-none print:p-0 print:shadow-none print:ring-0" aria-labelledby="packet-title">
     Header (border-b-2 border-neutral-900 pb-6): uppercase subtitle (text-sm font-semibold uppercase tracking-wide text-neutral-600) "Prepared with ClauseCompass, a plain-language reading aid."; h1 id="packet-title" (font-serif text-4xl font-medium tracking-tight) "Preparation packet"; notice (text-base leading-relaxed) "Information, not legal advice. ClauseCompass explains what the document says and shows where it says so; it does not tell you whether a clause is legal or fair, and it does not replace a lawyer or a legal-aid service."; about lines (space-y-0.5 text-sm text-neutral-700): "Document: {name} ({summary})", "Situation: {stage label}", "Prepared on {date in en-IN}" (compare adds "Prepared from the newer version, {name}.").
     Sections (each mt-10 space-y-6; header <div class="space-y-1 border-b border-neutral-300 pb-3"> holding the h2 break-after-avoid font-serif text-3xl font-medium tracking-tight and the lead text-sm leading-relaxed text-neutral-700; groups in space-y-8), in this order:
       a) "What the document says" — "The six points of the document map, in plain language. Each statement carries the number of the passage it rests on." Statements (text-base leading-relaxed) grouped under the six field titles (h3 break-after-avoid font-serif text-2xl font-medium tracking-tight), each ending in references like [1] [2]; "not found" points say so in text-sm text-neutral-700.
       b) "Dates in this document" — "Every full date the document writes out, in order, with the sentence it appears in." Date, sentence (serif), reference.
       Notes inside sections: the packet repeats every on-screen caveat in print form, using the same sentences as Blocks 5 and 6 — a group note or footnote (text-sm leading-relaxed text-neutral-700) for wording-only fields, withheld statements, empty timelines, empty or not-found review groups and the review-withheld line; an item note (text-sm leading-relaxed text-neutral-700) under a statement or question for a weak match, an unfound passage, an uncertain date or a standard-check reason; and a "note" item (<li class="break-inside-avoid border-l-2 border-dashed border-neutral-400 pl-3 text-base leading-relaxed">, optionally prefixed by an uppercase topic) where a field has nothing verified. Do not write new sentences for these; reuse the on-screen copy.
       c) "Questions to ask" — "The review prompts for this moment. Put each question to the other side or to an adviser and note the answer next to it." Each prompt is an <li class="space-y-2 break-inside-avoid border-l-4 border-neutral-300 pl-4">: h4 (font-serif text-xl font-medium tracking-tight) with the clause name and a family pill (ml-1 inline-block rounded-full border border-neutral-400 px-2 py-0.5 align-middle font-sans text-xs font-semibold uppercase tracking-wide text-neutral-700; no colour fill); why-it-matters in text-sm leading-relaxed text-neutral-700; the question in font-serif text-lg leading-relaxed followed by its references; "Found at" + reference numbers in text-sm text-neutral-700.
       d) "Records to gather" — "What to have with you when you talk to a lawyer or a legal-aid service. Where a line comes from a clause in this document, the passage numbers follow it." A checklist: each item has a printed empty checkbox square (span aria-hidden, mt-1.5 h-4 w-4 shrink-0 rounded-[3px] border-2 border-neutral-800) and text (text-base leading-relaxed), e.g. "Receipts, bank statements or transfer records for every payment the document mentions: deposits, rent or fees, and any penalty already charged." · "Whatever fixes the dates: when you received the document, when it started, and any reminder or notice sent near a deadline." · "Every notice, message or email about the problem, with proof of when it was sent or received."
       e) "The exact wording, by number" (print:break-before-page) — "Every numbered reference above points to one of these passages, quoted exactly as the document has it." Each passage is an <li id="…" tabindex="-1" class="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2 break-inside-avoid scroll-mt-6" + the paper ring: "[1]" (text-sm font-semibold text-neutral-700), then a space-y-1 column with the location first (text-sm text-neutral-600) and the passage below it (whitespace-pre-line font-serif text-base leading-relaxed). Paper ring for every focusable thing in the sheet (reference links and these targets): rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white; reference links are neutral underlined, print:no-underline.
     Footer (mt-12 space-y-3 border-t-2 border-neutral-900 pt-6 break-inside-avoid): h2 (font-serif text-2xl font-medium tracking-tight) "Information, not legal advice"; the three boundary points from the Welcome screen as a list; closing paragraph "This packet was prepared by software from the document's own wording and from a fixed set of checks. Use it to have a sharper conversation with a professional or an official legal-aid service such as NALSA or Tele Law; it does not replace that conversation."
     Sentinel after the sheet: sr-only focusable "End of the packet".
  4. Row flex justify-end border-t border-border pt-8 print:hidden with a primary continue link (48px recipe) "Next: official help you can contact" + ArrowRight h-5 w-5 → /help.

Print rules: A4, 15 mm margin, white page; html font-size forced to 100% in print; site header (with the settings menu), footer controls, actions, read-aloud and disclosure buttons are print:hidden; every evidence panel is print:block so the printed packet is complete without interaction; no background fill carries meaning (a monochrome print loses nothing).
States to build: analysing · failure · ready sheet on screen · print preview.
```

---

## Block 9 — Official help (`/help`)

```text
SCREEN 9 — OFFICIAL HELP. Route "/help?concern={id}". Reachable from anywhere (footer, Welcome, Safety, Packet); never gated.

Header back control: when the reader arrived from inside the app it is a <button> (back-link recipe) that goes back in history, and its label names the origin — "Back to the start" (/), "Back to your upload", "Back to the questions", "Back to the document map", "Back to the review prompts", "Back to what changed", "Back to your packet", "Back to the safety screen" — otherwise "Back to the start" → "/".
Main (space-y-12):
  1. h1 "Official help you can contact"; lead "Government-run services in India that give legal information and advice, take complaints, or answer in an emergency. ClauseCompass lists them so that you know where to turn. It is not connected to any of them, cannot contact them for you, and does not decide whether a service applies to your situation: that is for the service to say."
  2. Concern picker: <fieldset class="space-y-4"> with <legend> in the sub-section heading role "What is this about?"; hint (id="concern-hint", max-w-prose text-base text-muted-foreground) "Choosing changes which services are listed below. It is a way to find the right ones sooner, nothing more; whether a service can take up your matter is for that service to say."; <div class="grid gap-3 pt-2 sm:grid-cols-2"> of six radio cards (recipe in the context), in this order:
     • "Legal advice, or free legal aid" — "Talking to a lawyer before signing or replying, or finding out whether free legal aid is open to you."
     • "Rent, deposit or eviction" — "A landlord or a tenant, a deposit that has not come back, or a notice to leave."
     • "Salary, notice period or the workplace" — "An employer, unpaid salary, a notice period, or harassment at work."
     • "A purchase, a service or a refund" — "Something you paid for that was not delivered, was faulty, or was not refunded."
     • "Online fraud or a cyber crime" — "Money taken through a fake app, website or call, or abuse online."
     • "Someone is in danger or being forced" — "Threats, violence, a signature or a payment taken by force, or harm to a child."
     The selection lives in the URL (?concern=legal-advice | rent | work | consumer | cyber | safety); when absent it defaults from the session's document type; an unknown value is replaced in the URL, never shown as an error. Changing it replaces history, does not push.
  3. Results (section space-y-6): h2 in the sub-section heading role (font-serif text-2xl font-medium text-foreground md:text-3xl) with aria-live="polite" aria-atomic="true": "{n} services for “{concern label}”" (curly quotes; or "1 service for “…”"). When the safety concern is selected, first a safety alert card (flex items-start gap-3 rounded-2xl border-2 border-primary/40 bg-primary/5 p-5 text-lg font-medium text-foreground + Siren h-6 w-6 text-primary): "In an immediate emergency, 112 is the number for police, fire and ambulance from any phone in India." Then the links note (max-w-prose text-base text-muted-foreground) "Links open in a new tab, so anything you have prepared here stays open. Phone numbers open your phone's dialler." Then the resource cards in a space-y-6 stack.

Resource card: <article class="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm md:p-7" aria-labelledby>
  - name: h3 font-serif text-2xl font-medium leading-snug text-foreground
  - run-by line: text-base text-muted-foreground with "Run by" in font-medium text-foreground followed by the body name
  - summary: text-base leading-relaxed text-foreground md:text-lg
  - optional block "Who it is for" (space-y-1.5: h4 uppercase label + body text-base leading-relaxed text-foreground/90)
  - block "How to reach it", always present (space-y-3: h4 uppercase label + <ul class="space-y-3"> of contact rows flex items-start gap-3 text-base leading-relaxed)
  - contacts as inline links: phone numbers as tel: links with Phone h-5 w-5 and tabular-nums; SMS with MessageSquareText; websites as external links with ExternalLink and sr-only "(opens in a new tab)"
  - optional "Hours" line inside that block (text-base text-foreground/90): bold-ish "Hours:" (font-medium text-foreground) + the hours
  - footer (space-y-3 border-t border-border pt-4): confirmation line (flex items-start gap-2 text-base font-medium text-foreground + Info h-5 w-5 text-primary) "Confirm availability and eligibility with the service directly."; then (flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground + CalendarCheck h-4 w-4) "Last checked {date}" and "Source:" followed by the source host as an inline external link.
  No ratings, coverage badges or "recommended" marks. Every sentence on a card comes from its one source URL; leave a field out rather than guess it.

Footer: shared, without its official-help section here (this screen is where it leads); the boundary line stays.
States to build: each of the six concerns · the safety alert visible · arrival from the footer (origin-named back link) and direct arrival ("Back to the start").
```

---

## Block 10 — Not found and the error boundary

```text
SCREEN 10a — NOT FOUND. Any unknown route (redirects to /safety while escalated).
Page frame with selection:bg-primary/20 selection:text-foreground; skip link, site header with the settings menu.
<main id="main" class="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-8 max-w-md mx-auto">
  - icon tile: w-24 h-24 bg-muted border border-border/80 rounded-3xl flex items-center justify-center shadow-sm, FileQuestion w-12 h-12 text-primary
  - h1 (text-3xl md:text-4xl font-serif font-medium text-foreground tracking-tight) "Page not found"
  - body (text-lg text-muted-foreground leading-relaxed) "The page you're looking for doesn't exist or has been moved."
  - primary return link: inline-flex items-center justify-center gap-2 px-6 py-3 min-h-[44px] bg-primary text-primary-foreground font-medium rounded-xl hover:bg-primary/90 transition-colors + focusRing, ArrowLeft h-5 w-5, "Return to start" → "/"
No footer on this page.

SCREEN 10b — ERROR BOUNDARY (last resort; must not depend on the theme having loaded, so it uses neutral greys on purpose).
<div class="min-h-screen w-full flex items-center justify-center bg-gray-50 p-6"><div class="max-w-lg w-full text-center">
  - h1 "Something went wrong" (text-xl font-semibold text-gray-900)
  - "This part of the app hit an error. The rest of the app is still running." (mt-2 text-sm text-gray-600)
  - development builds only: the error in a <pre> (mt-4 overflow-x-auto rounded bg-gray-100 p-3 text-left text-xs text-gray-800)
  - button "Try again" (mt-4 rounded bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700)
The routed boundary resets on navigation and moves focus to the message.

```

---

## Block 11 — Checklist to paste after each screen

```text
Before calling this screen done, verify and report each line:
1. Only the tokens, type roles and recipes from the project context are used; no new colour, font size, shadow or radius; no hex values in components.
2. Every sentence on screen is one of the quoted strings; no invented copy; no verdict / prediction / entitlement / instruction / fairness wording about the document.
3. One h1, focused on arrival (the packet screen alone has a second h1 inside the printed sheet); heading levels in order; main#main, header, footer, nav with an accessible name present; lists are real lists; grouped choices use fieldset/legend.
4. Keyboard only: skip link first, every control reachable and operable with Tab / Shift+Tab / Enter / Space / arrows, visible 4px primary focus ring everywhere (2px neutral ring inside the packet sheet), no traps.
5. Every control ≥ 44px tall (noted exceptions only); adjacent controls ≥ gap-2 apart; busy and disabled states use aria-disabled + opacity, not the disabled attribute (Upload sample buttons excepted).
6. Errors have role="alert", progress and results have aria-live="polite", confirmations role="status"; each state is said in words with an icon, never by colour alone.
7. Every statement about the document sits in a source card with its evidence panel, or is replaced by the withheld fallback; quotations are serif, verbatim, whitespace-pre-line (Compare's marked excerpts are the one sans exception).
8. Layout holds at 320px wide with 150% text and at 200% browser zoom with no horizontal scrolling; at 768px and 1280px the column stays centred at max-w-3xl.
9. Nothing decorative was added: no images, illustrations, emoji, gradients, patterns, entrance animations, sidebars, tabs, modals or progress bars.
10. The boundary line "ClauseCompass gives information, not legal advice." is in the footer and the shared footer/site header are present and unchanged (Not found has the header but no footer).
```
