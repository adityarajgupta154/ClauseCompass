import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "wouter";
import { AArrowDown, AArrowUp, ChevronRight, CircleHelp, Contrast, Globe, Info, MessageSquare, Settings, Type, type LucideIcon } from "lucide-react";
import { copy } from "@/features/journey/copy";
import { focusRing } from "@/lib/focus-ring";
import { cn } from "@/lib/utils";
import { setDisplay, stepTextSize, THEMES, type Locale, type TextSize, type Theme } from "./display-store";
import { useDisplay } from "./use-display";

/**
 * The settings menu (FR-11) in the header of every screen: a gear button
 * that opens a panel with the reader's display settings (the language of the
 * product's own words, the size of the text, the theme) and the way to the
 * help page, the feedback address and the boundary statement. The settings
 * are the reader's and follow them from screen to screen and across sessions
 * (display-store); the panel holds nothing about any document.
 *
 * Only the product's words change with the language. The document's wording
 * and the statements prepared from it are shown as they are, so whenever
 * Hinglish is showing the header says under the bar that it is convenience
 * text, not the authoritative version (SiteHeader owns that note: it must be
 * visible on the screen, not only inside this panel). Hidden in print: the
 * packet is prepared in English at the size the paper needs.
 *
 * The panel closes on Escape (focus returns to the gear), on a press outside
 * it, and when focus leaves it (Tab past its last item); the gear toggles it.
 * It is positioned from the header's control group, so the group must be
 * `relative`: the panel hangs under the group's right edge and never past
 * the viewport's, whatever the width.
 */

/** The heading of the boundary statement on the welcome screen, where the about link leads; focusable there for this purpose. */
const ABOUT_TARGET_ID = "boundary-heading";

/**
 * Where "Give feedback" leads: a web form or a mailto address, set at build
 * time. Without one the row is not shown at all; there is no address to
 * invent. A value with any other scheme is a configuration mistake and is
 * reported, not used.
 */
function feedbackUrl(): string | null {
  const configured = import.meta.env.VITE_FEEDBACK_URL as string | undefined;
  if (configured === undefined || configured === "") return null;
  if (/^(https:|mailto:)/i.test(configured)) return configured;
  console.error(`VITE_FEEDBACK_URL must be an https: or mailto: address; "Give feedback" is not shown.`);
  return null;
}
const FEEDBACK_URL = feedbackUrl();

/** Whether a node (an event's target) is one of the given elements or inside one. */
function within(node: EventTarget | null, ...elements: (Element | null)[]): boolean {
  return node instanceof Node && elements.some((element) => element?.contains(node) === true);
}

const controlClass = `inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[0.625rem] px-3 text-sm font-medium transition-colors md:text-[0.9375rem] ${focusRing}`;
/** One button of a segmented control (language, theme): the chosen one is filled in the primary colour. */
const segmentClass = (pressed: boolean) =>
  cn(
    controlClass,
    "border",
    pressed ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-transparent text-foreground hover:bg-secondary hover:text-primary"
  );

export function SettingsMenu({ home = true }: { home?: boolean }) {
  const words = copy.display;
  const { locale, textSize, theme } = useDisplay();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const panelId = useId();
  const languageId = useId();
  const sizeId = useId();
  const themeId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: Event) => {
      if (!within(event.target, button.current, panel.current)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    setOpen(false);
    button.current?.focus();
  }

  /** Focus went somewhere outside the gear and the panel (Tab past the last item, a click elsewhere): the panel closes. A window that lost focus altogether keeps it. */
  function onBlur(event: FocusEvent<HTMLElement>) {
    if (open && event.relatedTarget !== null && !within(event.relatedTarget, button.current, panel.current)) setOpen(false);
  }

  /**
   * The about link: the Link itself navigates to the welcome screen with the
   * fragment (no page load, so an open document is not lost on the way; a
   * modifier or middle click never reaches here, the link opens as usual);
   * this only closes the panel and, once the welcome screen has rendered
   * (and RouteFocus has put focus on its heading), moves focus on to the
   * statement the fragment names, which a pushState navigation would not do.
   */
  function goToAbout() {
    setOpen(false);
    requestAnimationFrame(() => {
      const target = document.getElementById(ABOUT_TARGET_ID);
      if (target === null) return;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "start" });
    });
  }

  const smaller = stepTextSize(textSize, -1);
  const larger = stepTextSize(textSize, 1);

  return (
    <>
      <button
        type="button"
        ref={button}
        aria-label={words.label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((was) => !was)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-primary transition-colors hover:bg-primary/15 ${focusRing}`}
        data-testid="button-settings"
      >
        <Settings aria-hidden="true" className="h-[1.375rem] w-[1.375rem]" strokeWidth={1.75} />
      </button>
      {/* A named region, so the controls sit inside a landmark like everything else on the page. The two handlers only observe
          events bubbling up from its buttons (Escape closes the panel, focus leaving it closes the panel); the region itself is not operable. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- listeners for bubbled key and focus events, see above */}
      <section
        ref={panel}
        id={panelId}
        hidden={!open}
        aria-label={words.label}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        // Never taller than the viewport under the (sticky) header: at the largest text size the rows scroll inside the panel instead of running off the bottom of the screen.
        className="absolute right-0 top-[calc(100%+0.625rem)] z-50 max-h-[calc(100dvh-6rem)] w-[min(25rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-[1.25rem] border border-border bg-card p-2 text-left shadow-[0_24px_48px_-16px_rgba(31,42,58,0.28)]"
        data-testid="settings-panel"
      >
        <SettingRow icon={Globe} id={languageId} label={words.language.label}>
          <Segmented>
            <LanguageButton locale="en" current={locale} label={words.language.english} />
            <LanguageButton locale="hinglish" current={locale} label={words.language.hinglish} />
          </Segmented>
        </SettingRow>
        <SettingRow icon={Type} id={sizeId} label={words.textSize.label}>
          <div className="flex items-center gap-1.5">
            <SizeButton label={words.textSize.smaller} next={smaller} icon={<AArrowDown aria-hidden="true" className="h-5 w-5" />} testId="button-text-smaller" />
            {/* Polite, so a change is announced after the button's own name; the same span is the visible readout. */}
            <span
              aria-live="polite"
              className="inline-flex min-h-[44px] min-w-[4rem] items-center justify-center rounded-[0.625rem] border border-border bg-card px-2 text-center text-sm font-semibold tabular-nums text-foreground md:text-[0.9375rem]"
              data-testid="text-size-readout"
            >
              <span className="sr-only">{words.textSize.status(textSize)}</span>
              <span aria-hidden="true">{words.textSize.percent(textSize)}</span>
            </span>
            <SizeButton label={words.textSize.larger} next={larger} icon={<AArrowUp aria-hidden="true" className="h-5 w-5" />} testId="button-text-larger" />
          </div>
        </SettingRow>
        <SettingRow icon={Contrast} id={themeId} label={words.theme.label}>
          <Segmented>
            {THEMES.map((option) => (
              <ThemeButton key={option} theme={option} current={theme} label={words.theme[option]} />
            ))}
          </Segmented>
        </SettingRow>
        <hr className="mx-3 my-1.5 border-border/80" />
        <PanelLink icon={CircleHelp} href="/help" label={words.links.help} testId="link-settings-help" />
        {FEEDBACK_URL !== null && (
          <PanelLink icon={MessageSquare} href={FEEDBACK_URL} label={words.links.feedback} testId="link-settings-feedback" external />
        )}
        {/* Not on the safety screen (home is false there): once the flow has escalated no control leads back into the journey, and the welcome screen is part of it. */}
        {home && (
          <>
            <hr className="mx-3 my-1.5 border-border/80" />
            <PanelLink icon={Info} href={`/#${ABOUT_TARGET_ID}`} label={words.links.about} testId="link-settings-about" onClick={goToAbout} />
          </>
        )}
      </section>
    </>
  );
}

/** A setting: its icon and name on the left, its control on the right (under the name when the row is too narrow for both). */
function SettingRow({ icon: Icon, id, label, children }: { icon: LucideIcon; id: string; label: string; children: ReactNode }) {
  return (
    <div role="group" aria-labelledby={id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2">
      <span className="flex items-center gap-3">
        <IconDisc icon={Icon} />
        <span id={id} className="text-sm font-medium text-foreground md:text-[0.9375rem]">
          {label}
        </span>
      </span>
      {children}
    </div>
  );
}

/** The panel's icons, each in a small disc of the secondary colour. */
function IconDisc({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
      <Icon className="h-[1.125rem] w-[1.125rem]" strokeWidth={1.75} />
    </span>
  );
}

/** The buttons of a choice, side by side in one bordered box. */
function Segmented({ children }: { children: ReactNode }) {
  return <div className="inline-flex items-center gap-0.5 rounded-xl border border-border bg-background p-0.5">{children}</div>;
}

function LanguageButton({ locale, current, label }: { locale: Locale; current: Locale; label: string }) {
  const pressed = locale === current;
  return (
    <button
      type="button"
      // Each language names itself in its own language, so a reader who cannot read the current one still finds their own.
      lang={locale === "en" ? "en" : "hi-Latn"}
      aria-pressed={pressed}
      onClick={() => setDisplay({ locale })}
      className={segmentClass(pressed)}
      data-testid={`button-language-${locale}`}
    >
      {label}
    </button>
  );
}

function ThemeButton({ theme, current, label }: { theme: Theme; current: Theme; label: string }) {
  const pressed = theme === current;
  return (
    <button type="button" aria-pressed={pressed} onClick={() => setDisplay({ theme })} className={segmentClass(pressed)} data-testid={`button-theme-${theme}`}>
      {label}
    </button>
  );
}

function SizeButton({ label, next, icon, testId }: { label: string; next: TextSize | null; icon: ReactNode; testId: string }) {
  const atEnd = next === null;
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={atEnd || undefined}
      onClick={() => {
        if (next !== null) setDisplay({ textSize: next });
      }}
      className={cn(
        controlClass,
        "min-w-[44px] !px-2 border border-border bg-card text-foreground",
        atEnd ? "cursor-default text-muted-foreground/60" : "hover:border-primary/50 hover:text-primary"
      )}
      data-testid={testId}
    >
      {icon}
    </button>
  );
}

/** A row that leads somewhere: icon, name, and a chevron at the far end. */
function PanelLink({
  icon: Icon,
  href,
  label,
  testId,
  external = false,
  onClick,
}: {
  icon: LucideIcon;
  href: string;
  label: string;
  testId: string;
  external?: boolean;
  onClick?: () => void;
}) {
  const className = `flex min-h-[48px] items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted md:text-[0.9375rem] ${focusRing}`;
  const body = (
    <>
      <span className="flex items-center gap-3">
        <IconDisc icon={Icon} />
        {label}
      </span>
      <ChevronRight aria-hidden="true" className="h-[1.125rem] w-[1.125rem] shrink-0 text-muted-foreground" />
    </>
  );
  if (external) {
    return (
      <a href={href} className={className} data-testid={testId} target="_blank" rel="noopener noreferrer">
        {body}
      </a>
    );
  }
  return (
    <Link href={href} className={className} data-testid={testId} onClick={onClick}>
      {body}
    </Link>
  );
}
