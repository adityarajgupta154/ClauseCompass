import { Link } from "wouter";
import { ArrowLeft, Languages } from "lucide-react";
import { BrandMark, Wordmark } from "@/components/brand-mark";
import { AuthControl } from "@/features/auth/auth-control";
import { copy } from "@/features/journey/copy";
import { SettingsMenu } from "@/features/display/settings-menu";
import { useDisplay } from "@/features/display/use-display";
import { focusRing } from "@/lib/focus-ring";

interface SiteHeaderProps {
  /** A way back to the previous screen, rendered as a link next to the brand mark. */
  back?: { href: string; label: string; testId: string };
  /**
   * Whether the brand mark links to the welcome screen. The safety screen
   * passes false: once the flow has escalated no control leads back into
   * the journey (PRD §8), and the routing tests check every anchor. The
   * settings menu drops its about link (to the welcome screen) for the same reason.
   */
  home?: boolean;
  /** Whether to show the brand mark at all (every screen does today; the option stays for a screen whose heading is the name itself). */
  brand?: boolean;
  /** Whether to show the account control (sign in / sign out). The sign-in screen passes false; the safety screen shows none either, since sign-out leads back to the start. */
  account?: boolean;
}

/*
 * Sticky only from lg up: on a phone, pinned, the bar would cover a good part
 * of the screen and whatever has focus behind it.
 */
/** The brand, as a link or not: at least 44px tall as a target even on a phone, where the mark itself is 40px. */
const brandClass = "inline-flex min-h-[44px] items-center gap-2.5 rounded-xl";

export function SiteHeader({ back, home = true, brand = true, account = true }: SiteHeaderProps) {
  const { locale } = useDisplay();
  const mark = (
    <>
      {/* The needle turns once when the mark is hovered as a link; nothing moves for a reader who asked for less motion. */}
      <BrandMark
        className="h-10 w-10 sm:h-12 sm:w-12 lg:h-14 lg:w-14"
        needleClassName="transition-transform duration-700 ease-out group-hover:rotate-[395deg] motion-reduce:transition-none"
      />
      <span className="flex min-w-0 flex-col leading-none">
        <Wordmark className="font-serif text-xl font-bold tracking-tight text-foreground sm:text-2xl lg:text-3xl" />
        {/* The motto under the name, from md up: on a phone the row has no room for a second line. */}
        <span className="mt-1.5 hidden text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground md:block">
          {copy.product.motto}
        </span>
      </span>
    </>
  );
  return (
    <header className="relative z-40 w-full border-b border-border/80 bg-card shadow-sm print:hidden lg:sticky lg:top-0">
      {/* Edge to edge, like the banner under it: the brand at the page's left margin, the controls at its right. */}
      {/* One row from md up: brand, back link, controls. Below md the back link takes a second row of its own (it is in the tab order right after the brand either way); at the largest text sizes the controls may still wrap under the brand, never over it. */}
      <div className="mx-auto flex w-full max-w-[110rem] flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3 lg:px-[max(2rem,5.5vw)]">
        {brand && home && (
          <Link href="/" className={`${brandClass} order-1 group ${focusRing}`} data-testid="link-home">
            {mark}
          </Link>
        )}
        {brand && !home && <span className={`${brandClass} order-1`}>{mark}</span>}
        {back && (
          <div className="order-3 flex min-w-0 basis-full items-center gap-4 md:order-2 md:basis-auto">
            <span className="hidden h-8 w-px shrink-0 bg-border md:block" aria-hidden="true"></span>
            <Link
              href={back.href}
              data-testid={back.testId}
              className={`inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-base font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${focusRing}`}
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              {back.label}
            </Link>
          </div>
        )}
        {/* The control group: the settings menu, then the account control behind a hairline. `relative`, because the settings panel hangs from this group's right edge (SettingsMenu). */}
        <div className="relative order-2 ml-auto flex shrink-0 items-center gap-2 sm:gap-3 md:order-3">
          <SettingsMenu home={home} />
          {account && home && (
            <>
              <span className="h-8 w-px shrink-0 bg-border" aria-hidden="true"></span>
              <AuthControl />
            </>
          )}
        </div>
      </div>
      {/* Whenever Hinglish is showing, the whole screen says what it is: the document's words and the statements from it are not translated. On the screen itself, not only inside the settings panel. */}
      {locale === "hinglish" && (
        <div className="border-t border-primary/15 bg-primary/5">
          <div className="mx-auto flex w-full max-w-[110rem] items-start gap-2 px-6 py-2.5 text-sm leading-relaxed text-primary lg:px-[max(2rem,5.5vw)]">
            <Languages aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
            <p data-testid="text-convenience-note">{copy.display.convenience}</p>
          </div>
        </div>
      )}
    </header>
  );
}
