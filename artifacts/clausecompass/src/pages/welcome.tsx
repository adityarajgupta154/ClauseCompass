import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  ArrowRight,
  BookOpen,
  Check,
  FileText,
  Handshake,
  Info,
  LifeBuoy,
  Phone,
  ScanSearch,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Wordmark } from "@/components/brand-mark";
import { BoundaryNote, BoundaryPapers } from "@/components/boundary-aside";
import { HeroScene } from "@/components/hero-scene";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SkipLink } from "@/components/skip-link";
import { StageArt } from "@/components/stage-art";
import { HelpScales, HelpShelf } from "@/components/help-aside";
import { StageDesk, StageShelf } from "@/components/stage-aside";
import { copy } from "@/features/journey/copy";
import { useJourney } from "@/features/journey/journey-context";
import { STAGES, type StageId } from "@/features/journey/stages";
import { HelpLink } from "@/features/resources/help-link";
import { focusRing } from "@/lib/focus-ring";
import { cn } from "@/lib/utils";

/** The banner's three-item row, in the order the introduction makes its promises. */
const HERO_FEATURES: { key: "plain" | "source" | "prepared"; icon: LucideIcon }[] = [
  { key: "plain", icon: FileText },
  { key: "source", icon: ScanSearch },
  { key: "prepared", icon: Handshake },
];

/** The three points beside the way to official help: where the links go, how fresh they are, what is not asked for. */
const HELP_POINTS: { key: "sources" | "checked" | "upload"; icon: LucideIcon }[] = [
  { key: "sources", icon: Phone },
  { key: "checked", icon: ShieldCheck },
  { key: "upload", icon: Users },
];

export default function Welcome() {
  const { stage, setStage, justDeleted } = useJourney();
  const [, navigate] = useLocation();
  // The delete control sits in the footer, so the reader arrives from the bottom of a long page: bring the confirmation into view and announce it.
  const deletedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (justDeleted) deletedRef.current?.focus();
  }, [justDeleted]);

  function choose(id: StageId) {
    setStage(id);
    navigate("/upload");
  }

  return (
    <div className="min-h-[100dvh] flex flex-col font-sans bg-background selection:bg-primary/20 selection:text-foreground">
      <SkipLink />
      <SiteHeader />

      <main id="main" className="flex-1 w-full">
        {/* The banner: the name and what the product does, beside a picture of it doing that. */}
        {/* Edge to edge like the header, capped only on very wide screens; the words take 45% and the picture 55%. */}
        <div className="relative overflow-hidden border-b border-border/60 bg-background">
          <div className="relative mx-auto grid w-full max-w-[110rem] lg:grid-cols-[minmax(0,45fr)_minmax(0,55fr)] lg:items-center">
            {/* A container: the name is sized to the column it sits in and never wider, and the controls grow with the column (@lg) rather than the viewport (the text-size control changes neither). */}
            <div className="@container min-w-0 space-y-8 px-6 py-12 text-center md:py-16 lg:py-14 lg:pl-[max(2rem,5.5vw)] lg:pr-2 lg:text-left animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both motion-reduce:animate-none">
              <header className="space-y-4">
                <p className="flex flex-wrap items-center justify-center gap-3 text-[0.8125rem] font-semibold uppercase tracking-[0.18em] text-primary lg:flex-nowrap lg:justify-start">
                  {/* The short rule before the line, from lg where the text is left-aligned. */}
                  <span aria-hidden="true" className="hidden h-px w-9 bg-primary lg:block"></span>
                  {copy.welcome.hero.eyebrow}
                </p>
                {/* The two halves of the name in two colours; the text is still the one word. */}
                <h1
                  className="text-[clamp(2.5rem,14cqw,5.75rem)] font-serif font-bold leading-[1.02] tracking-tight text-foreground"
                  data-testid="text-product-name"
                >
                  <Wordmark />
                </h1>
                <p
                  className="font-serif text-[clamp(1.375rem,5cqw,2.25rem)] font-medium leading-tight text-foreground"
                  data-testid="text-product-tagline"
                >
                  {copy.product.tagline}
                </p>
              </header>

              <section aria-label={copy.welcome.introductionLabel} className="mx-auto max-w-2xl lg:mx-0">
                <p className="text-lg leading-[1.6] text-muted-foreground md:text-xl" data-testid="text-product-intro">
                  {copy.product.intro}
                </p>
              </section>

              <div className="flex flex-wrap items-center justify-center gap-4 lg:justify-start">
                {/* Straight to the choice the screen exists for, past the picture on a small screen. */}
                <a
                  href="#stage-heading"
                  data-testid="link-choose-situation"
                  className={`group inline-flex min-h-[60px] items-center gap-3 rounded-lg bg-primary px-7 text-base font-semibold text-primary-foreground shadow-md transition-colors hover:bg-primary/90 @lg:min-h-[68px] @lg:px-10 @lg:text-lg ${focusRing}`}
                >
                  {copy.welcome.chooseLabel}
                  <ArrowRight aria-hidden="true" className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none" />
                </a>
                {/* What the product is and is not, before choosing anything. */}
                <a
                  href="#boundary-heading"
                  data-testid="link-learn-more"
                  className={`inline-flex min-h-[60px] items-center gap-3 rounded-lg border border-border bg-card px-7 text-base font-semibold text-foreground transition-colors hover:border-primary/50 hover:text-primary @lg:min-h-[68px] @lg:px-8 @lg:text-lg ${focusRing}`}
                >
                  <BookOpen aria-hidden="true" className="h-6 w-6" />
                  {copy.welcome.hero.learnMore}
                </a>
              </div>

              {/* Icon above the words in a narrow column, beside them once the column is wide enough (@lg) for a row of three with dividers. */}
              <ul
                className="mx-auto grid max-w-md grid-cols-3 pt-2 @lg:flex @lg:max-w-none @lg:items-center @lg:justify-center lg:mx-0 lg:justify-start"
                aria-label={copy.welcome.introductionLabel}
              >
                {HERO_FEATURES.map(({ key, icon: Icon }, index) => (
                  <li
                    key={key}
                    className={cn(
                      "flex min-w-0 flex-col items-center gap-2.5 px-2 text-center text-sm font-medium leading-snug text-foreground @lg:flex-row @lg:gap-3 @lg:px-5 @lg:text-left @lg:text-base @lg:first:pl-0 @lg:last:pr-0",
                      index > 0 && "@lg:border-l @lg:border-border",
                    )}
                  >
                    <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary text-primary @lg:h-14 @lg:w-14">
                      <Icon className="h-6 w-6 @lg:h-7 @lg:w-7" strokeWidth={1.75} />
                    </span>
                    {/* A fixed measure once the row is horizontal, so each label breaks into the same two lines instead of shrinking with the row. */}
                    <span className="@lg:w-[7rem]">{copy.welcome.hero.features[key]}</span>
                  </li>
                ))}
              </ul>
            </div>

            <HeroScene className="mx-6 mb-12 animate-in fade-in duration-1000 delay-150 fill-mode-both motion-reduce:animate-none lg:mx-0 lg:mb-0" />
          </div>
        </div>

        {/* Each block below centres itself; the boundary's band is full width so the pictures beside it can use the page margins. */}
        <div className="w-full space-y-16 py-14 md:py-20">
          {/* Confirmation of an explicit delete (FR-12): shown once, where the delete control sends the reader. */}
          {justDeleted && (
            <div className="mx-auto max-w-5xl px-6">
              <section
                ref={deletedRef}
                tabIndex={-1}
                role="status"
                aria-label={copy.session.deletedTitle}
                data-testid="section-session-deleted"
                className={`flex items-start gap-4 rounded-3xl border border-primary/20 bg-card p-6 md:p-8 shadow-sm ${focusRing}`}
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <ShieldCheck
                    aria-hidden="true"
                    className="h-6 w-6 text-primary"
                  />
                </div>
                <div className="space-y-2 mt-1">
                  <p className="text-xl font-semibold text-foreground tracking-tight">
                    {copy.session.deletedTitle}
                  </p>
                  <p className="text-lg leading-relaxed text-foreground/80">
                    {copy.session.deletedBody}
                  </p>
                </div>
              </section>
            </div>
          )}

          {/* The boundary sits above the picker in DOM and reading order, so it is
            always encountered before any choice can be made (PRD §5 step 1). */}
          {/* Clipped sideways only: the papers may run off the page's left edge, the card's shadow still falls below. */}
          <div className="relative overflow-x-clip">
            <BoundaryPapers />
            <BoundaryNote />
            <div className="px-6">
              <section
                aria-labelledby="boundary-heading"
                data-testid="section-boundary"
                className="relative mx-auto max-w-[53rem] overflow-hidden rounded-[1.25rem] border border-border/80 bg-card px-6 py-8 shadow-xl shadow-foreground/[0.07] md:px-12 md:pb-10 md:pt-9"
              >
                {/* The brick-red edge along the card's left side. */}
                <div aria-hidden="true" className="absolute inset-y-0 left-0 w-2.5 bg-primary"></div>
                <div className="flex items-center gap-5 md:gap-8">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-secondary text-primary md:h-16 md:w-16">
                    <Info aria-hidden="true" className="h-7 w-7 md:h-8 md:w-8" strokeWidth={1.75} />
                  </div>
                  {/* Focusable so the banner's second link lands here with focus. */}
                  <h2
                    id="boundary-heading"
                    tabIndex={-1}
                    className="font-serif text-2xl font-medium leading-tight tracking-tight text-foreground md:text-[2.5rem]"
                  >
                    {copy.boundary.title}
                  </h2>
                </div>
                {/* Under the title rather than under the icon from md, each point after a short rule, a hairline between them. */}
                <ul className="mt-5 md:ml-[5.25rem] md:mt-6">
                  {copy.boundary.points.map((point, index) => (
                    <li
                      key={index}
                      className="flex gap-5 border-b border-border/70 py-5 text-base leading-[1.55] text-muted-foreground first:pt-0 last:border-b-0 last:pb-0 md:py-6 md:text-[1.0625rem]"
                      data-testid={`text-boundary-point-${index}`}
                    >
                      <span aria-hidden="true" className="mt-[0.7em] h-0.5 w-6 shrink-0 rounded-full bg-primary"></span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>

          {/* The choice's band is full width too, for the shelf and the desk beside the cards. */}
          <div className="relative overflow-x-clip">
            <StageShelf />
            <StageDesk />
            <div className="px-6">
              <section aria-labelledby="stage-heading" className="mx-auto max-w-[72rem] pt-4">
                <div className="mx-auto max-w-3xl space-y-4 text-center">
                  {/* The short line over the heading, with a rule either side. */}
                  <p className="flex items-center justify-center gap-4 text-xs font-semibold uppercase tracking-[0.18em] text-primary md:text-[0.8125rem]">
                    <span aria-hidden="true" className="h-px w-8 bg-primary/70"></span>
                    {copy.welcome.beginEyebrow}
                    <span aria-hidden="true" className="h-px w-8 bg-primary/70"></span>
                  </p>
                  {/* Focusable so the banner's link lands here with focus, not just the scroll position. */}
                  <h2
                    id="stage-heading"
                    tabIndex={-1}
                    className="font-serif text-3xl font-medium tracking-tight text-foreground md:text-[3.375rem] md:leading-[1.1]"
                  >
                    {copy.welcome.heading}
                  </h2>
                  <p className="text-lg leading-relaxed text-muted-foreground">
                    {copy.welcome.lead}
                  </p>
                </div>

                <ul
                  aria-label={copy.welcome.chooseLabel}
                  className="mt-8 grid gap-5 md:mt-10 md:grid-cols-3"
                >
                  {STAGES.map(({ id }) => {
                    const option = { id, ...copy.stages[id] };
                    const labelId = `stage-${option.id}-label`;
                    const descriptionId = `stage-${option.id}-description`;
                    const exampleId = `stage-${option.id}-example`;
                    const earlierId = `stage-${option.id}-earlier`;
                    const isEarlierChoice = stage === option.id;
                    return (
                      <li key={option.id}>
                        {/* Native button, one Tab stop per option. The accessible name is
                          the label alone; the longer text is exposed as its description. */}
                        <button
                          type="button"
                          onClick={() => choose(option.id)}
                          aria-labelledby={labelId}
                          aria-describedby={
                            isEarlierChoice
                              ? `${descriptionId} ${exampleId} ${earlierId}`
                              : `${descriptionId} ${exampleId}`
                          }
                          data-testid={`button-stage-${option.id}`}
                          className={cn(
                            "group relative flex h-full w-full flex-col rounded-2xl border bg-card p-7 text-left shadow-[0_14px_34px_-18px_rgba(31,42,58,0.28)] transition-[color,background-color,border-color,transform] focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary md:p-8",
                            isEarlierChoice
                              ? "border-primary/40 bg-primary/[0.02] hover:border-primary/60"
                              : "border-border hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_22px_40px_-18px_rgba(31,42,58,0.32)]",
                          )}
                        >
                          {/* The drawing takes the card's width; the arrow sits in the corner over it. */}
                          <span
                            aria-hidden="true"
                            className="absolute right-7 top-7 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-primary transition-[color,background-color,transform] duration-300 group-hover:translate-x-1 group-hover:bg-primary group-hover:text-primary-foreground motion-reduce:transition-none md:right-8 md:top-8"
                          >
                            <ArrowRight className="h-5 w-5" />
                          </span>
                          <span className="flex flex-1 flex-col gap-4">
                            <StageArt
                              stage={option.id}
                              className="-mt-1 transition-transform duration-500 group-hover:-rotate-1 group-hover:scale-[1.03] motion-reduce:transition-none"
                            />
                            {isEarlierChoice && (
                              <span
                                id={earlierId}
                                data-testid={`status-earlier-choice-${option.id}`}
                                className="inline-flex items-center gap-2 self-start rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
                              >
                                <Check aria-hidden="true" className="h-4 w-4" />
                                {copy.welcome.earlierChoice}
                              </span>
                            )}
                            <span
                              id={labelId}
                              className="font-serif text-[1.625rem] font-medium leading-tight tracking-tight text-foreground transition-colors group-hover:text-primary md:text-[1.75rem]"
                            >
                              {option.label}
                            </span>
                            <span
                              id={descriptionId}
                              className="flex-1 text-base leading-relaxed text-muted-foreground md:text-[0.9375rem] md:leading-[1.6]"
                            >
                              {option.description}
                            </span>
                          </span>
                          <span
                            id={exampleId}
                            className="mt-5 border-t border-border/60 pt-4 text-[0.9375rem] leading-relaxed text-primary"
                          >
                            {option.example}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {/* The line under the three cards, set like the one over the heading. */}
                <p className="mt-12 flex items-center justify-center gap-4 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  <span aria-hidden="true" className="h-px w-8 bg-primary/70"></span>
                  {copy.welcome.closingLine}
                  <span aria-hidden="true" className="h-px w-8 bg-primary/70"></span>
                </p>
              </section>
            </div>
          </div>

          {/* The direct way to official help (FR-10), for a reader who needs a service before, or instead of, an analysis.
            A tinted band, full width for the pictures beside the card, pulled down over the page's bottom padding so it meets the footer. */}
          <div className="relative -mb-14 overflow-x-clip bg-secondary/60 py-14 md:-mb-20 md:py-16">
            <HelpShelf />
            <HelpScales />
            <div className="px-6">
              <section
                aria-labelledby="official-help-heading"
                data-testid="section-official-help"
                className="relative mx-auto grid max-w-[66rem] gap-8 rounded-2xl border border-border/70 bg-card p-7 shadow-[0_28px_56px_-28px_rgba(31,42,58,0.32)] md:p-10 lg:grid-cols-[minmax(0,1.7fr)_1px_minmax(0,1fr)] lg:gap-8"
              >
                <div className="flex flex-col gap-5 sm:flex-row sm:gap-6">
                  <div className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                    <LifeBuoy aria-hidden="true" className="h-9 w-9" strokeWidth={1.5} />
                  </div>
                  <div className="space-y-4">
                    <h2
                      id="official-help-heading"
                      className="font-serif text-3xl font-medium leading-tight tracking-tight text-foreground md:text-[2.25rem]"
                    >
                      {copy.resources.entry.welcomeHeading}
                    </h2>
                    <p className="text-lg leading-relaxed text-muted-foreground">
                      {copy.resources.entry.welcomeLine}
                    </p>
                    <HelpLink
                      testId="link-welcome-official-help"
                      className={`mt-2 inline-flex min-h-[3.5rem] items-center justify-center gap-3 rounded-xl bg-primary px-8 text-lg font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 ${focusRing}`}
                    >
                      {copy.resources.entry.welcomeLink}
                      <ArrowRight className="h-6 w-6" aria-hidden="true" />
                    </HelpLink>
                  </div>
                </div>
                {/* The hairline between the two halves once they sit side by side. */}
                <div aria-hidden="true" className="hidden bg-border/70 lg:block"></div>
                <ul className="flex flex-col gap-5 border-t border-border/70 pt-7 lg:border-t-0 lg:pt-1">
                  {HELP_POINTS.map(({ key, icon: Icon }) => (
                    <li key={key} className="flex items-start gap-4" data-testid={`text-help-point-${key}`}>
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                        <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={1.75} />
                      </span>
                      <span className="flex flex-col gap-1">
                        <span className="font-serif text-lg font-medium leading-snug text-foreground">
                          {copy.welcome.helpPoints[key].title}
                        </span>
                        <span className="text-[0.9375rem] leading-relaxed text-muted-foreground">
                          {copy.welcome.helpPoints[key].line}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
