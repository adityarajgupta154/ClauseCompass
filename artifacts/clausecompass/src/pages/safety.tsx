import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { ArrowRight, RotateCcw, ShieldCheck } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SkipLink } from "@/components/skip-link";
import { copy } from "@/features/journey/copy";
import { useJourney } from "@/features/journey/journey-context";
import { HelpLink } from "@/features/resources/help-link";
import { SafetyGuidance } from "@/features/safety/safety-guidance";
import { focusRing } from "@/lib/focus-ring";

/**
 * The safety-escalation screen (PRD §8): the only screen of a flow that has
 * escalated. Emergency guidance first, from the resource registry; no
 * upload, no question, no way onward with the document — the provider set
 * it aside when the flow escalated, and the router keeps every other step
 * out of reach. The one control that leaves this screen starts a new journey
 * from the beginning. RequireEscalation wraps it in the router, so the
 * escalation is present.
 */
export default function SafetyPage() {
  const { safety, setAside, reset } = useJourney();
  const [, navigate] = useLocation();
  const words = copy.safety;
  // The reader arrives mid-flow; put focus on the heading so the screen announces itself.
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  if (safety === null) return null;

  function startOver() {
    reset();
    navigate("/");
  }

  return (
    <div className="flex min-h-[100dvh] flex-col font-sans bg-background">
      <SkipLink />
      <SiteHeader home={false} />

      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-6 py-12 md:py-16 space-y-16">
        <header className="space-y-4">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className={`font-serif text-4xl font-medium tracking-tight text-foreground md:text-5xl ${focusRing} rounded-md`}
            data-testid="text-safety-heading"
          >
            {words.heading}
          </h1>
        </header>

        <div className="space-y-12">
          <SafetyGuidance safety={safety} />

          <div>
            <HelpLink
              concern="safety"
              testId="link-more-safety-help"
              className={`inline-flex min-h-[56px] items-center justify-center gap-3 rounded-2xl border-2 border-primary/20 bg-primary/[0.03] px-8 text-lg font-semibold text-primary transition-colors hover:bg-primary/10 hover:border-primary/40 hover:shadow-sm ${focusRing}`}
            >
              {words.routes.more}
              <ArrowRight aria-hidden="true" className="h-6 w-6" />
            </HelpLink>
          </div>

          <section
            aria-labelledby="document-heading"
            data-testid="section-document"
            className="flex flex-col sm:flex-row items-start sm:items-center gap-6 rounded-3xl border border-border/80 bg-muted/20 p-8 md:p-10 shadow-sm"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-card shadow-sm border border-border/80 shrink-0">
               <ShieldCheck aria-hidden="true" className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-2 flex-1 min-w-0">
              <h2 id="document-heading" className="text-2xl font-serif font-medium text-foreground tracking-tight">
                {words.document.heading}
              </h2>
              <p className="text-lg leading-relaxed text-muted-foreground" data-testid="text-document-fate">
                {words.document.notAnalysed}
                {setAside !== null && ` ${setAside.status === "unconfirmed" ? words.document.unconfirmed(setAside.ttlMinutes) : words.document[setAside.status]}`}
              </p>
            </div>
          </section>

          <div className="pt-8 border-t border-border/60 flex justify-center">
            <button
              type="button"
              onClick={startOver}
              data-testid="button-start-over"
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl px-5 py-2.5 text-base font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${focusRing}`}
            >
              <RotateCcw aria-hidden="true" className="h-5 w-5" />
              {words.startOver}
            </button>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}