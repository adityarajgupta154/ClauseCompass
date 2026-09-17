import { useEffect, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { ArrowLeft, Siren } from "lucide-react";
import { CONCERN_IDS, isConcernId, resourcesFor, suggestConcern, type ConcernId } from "@workspace/resources";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SkipLink } from "@/components/skip-link";
import { copy } from "@/features/journey/copy";
import { useJourney } from "@/features/journey/journey-context";
import { ResourceCards } from "@/features/resources/resource-cards";
import { focusRing } from "@/lib/focus-ring";

/**
 * Official help (PRD §5 step 8; FR-10): the reviewed registry of government
 * services, shown by what the reader says the matter is about. The screen is
 * open from anywhere, with or without a session, because the moment a reader
 * needs a helpline is not always after an analysis. The concern lives in the
 * URL (`?concern=`) so that a reload or a shared link lands on the same list;
 * when the URL has none, the document type the session knows picks one and
 * the URL is brought in line. Nothing here calls the API or a model: the
 * cards resolve the registry themselves.
 */
export default function OfficialHelpPage() {
  const { session } = useJourney();
  const [, navigate] = useLocation();
  const search = useSearch();
  const requested = new URLSearchParams(search).get("concern");
  const concern: ConcernId = isConcernId(requested) ? requested : suggestConcern(session?.documentType);
  const [returnTo] = useState(readReturnPath);
  const words = copy.resources;

  // Replace, not push: the concern is a filter of this screen, not a place the back button should revisit one by one.
  // The recorded return path travels with the entry, so a reload keeps it.
  function show(next: ConcernId) {
    navigate(`/help?concern=${next}`, { replace: true, state: window.history.state });
  }

  // Bring the URL in line when it named no concern, or one the registry does not know.
  useEffect(() => {
    if (requested !== concern) navigate(`/help?concern=${concern}`, { replace: true, state: window.history.state });
  }, [requested, concern, navigate]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background font-sans">
      <SkipLink />
      <SiteHeader />

      <main id="main" className="mx-auto w-full max-w-4xl flex-1 space-y-12 px-6 py-8 md:py-12">
        <div className="flex">
          <BackControl returnTo={returnTo} />
        </div>

        <div className="space-y-4">
          <h1 className="font-serif text-4xl font-medium tracking-tight text-foreground md:text-5xl" data-testid="text-help-heading">
            {words.heading}
          </h1>
          <p className="max-w-prose text-lg leading-relaxed text-muted-foreground" data-testid="text-help-lead">
            {words.lead}
          </p>
        </div>

        <fieldset className="space-y-4 rounded-3xl border border-border/80 bg-card p-6 shadow-sm md:p-8" data-testid="fieldset-concern">
          <legend className="font-serif text-2xl font-medium text-foreground md:text-3xl">{words.concernLegend}</legend>
          <p id="concern-hint" className="max-w-prose text-base text-muted-foreground">
            {words.concernHint}
          </p>
          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            {CONCERN_IDS.map((id) => {
              const option = words.concerns[id];
              const descriptionId = `concern-${id}-description`;
              return (
                // The whole card is the label, so the target is the card and one Tab stop reaches the group.
                <label
                  key={id}
                  htmlFor={`concern-${id}`}
                  data-testid={`option-concern-${id}`}
                  className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-border bg-background p-4 transition-colors hover:border-primary/60 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background md:p-5"
                >
                  <input
                    type="radio"
                    id={`concern-${id}`}
                    name="concern"
                    value={id}
                    checked={concern === id}
                    onChange={() => show(id)}
                    aria-describedby={descriptionId}
                    className="mt-1 h-5 w-5 shrink-0 accent-primary focus-visible:outline-none"
                  />
                  <span className="space-y-1">
                    <span className="block text-lg font-medium leading-snug text-foreground">{option.label}</span>
                    <span id={descriptionId} className="block text-base leading-relaxed text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <section aria-labelledby="resources-heading" className="space-y-6">
          <h2
            id="resources-heading"
            aria-live="polite"
            aria-atomic="true"
            className="font-serif text-2xl font-medium text-foreground md:text-3xl"
            data-testid="text-resources-heading"
          >
            {words.showing(resourcesFor(concern).length, words.concerns[concern].label)}
          </h2>
          {concern === "safety" && (
            <p
              className="flex items-start gap-3 rounded-2xl border-2 border-primary/40 bg-primary/5 p-5 text-lg font-medium text-foreground"
              data-testid="text-emergency-number"
            >
              <Siren aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
              <span>{words.emergency}</span>
            </p>
          )}
          <p className="max-w-prose text-base text-muted-foreground" data-testid="text-links-note">
            {words.linksNote}
          </p>
          <ResourceCards concern={concern} />
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

const backClass = `-ml-4 inline-flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-xl px-4 py-2 text-base font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${focusRing}`;

/**
 * Back to the screen the reader left. When the link that brought them here
 * recorded that screen, this steps back through history to it, so the
 * browser's own back button then continues from there instead of bouncing
 * between the two screens. Without a record (a direct visit, a shared link)
 * it is a plain link to the start.
 */
function BackControl({ returnTo }: { returnTo: string | null }) {
  const words = copy.resources;
  if (returnTo === null) {
    return (
      <Link href="/" data-testid="link-back-from-help" className={backClass}>
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        {words.backTo["/"]}
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => window.history.back()} data-testid="link-back-from-help" className={backClass}>
      <ArrowLeft className="h-5 w-5" aria-hidden="true" />
      {words.backTo[returnTo] ?? words.back}
    </button>
  );
}

/**
 * The screen the reader came from, if the link that brought them here
 * recorded it in this history entry (`HelpLink` does); null otherwise. The
 * entry's state survives a reload and the concern changes above, which
 * replace the entry but carry the state along.
 */
function readReturnPath(): string | null {
  const state: unknown = typeof window === "undefined" ? null : window.history.state;
  if (state === null || typeof state !== "object" || !("from" in state)) return null;
  const from = (state as { from: unknown }).from;
  return typeof from === "string" && /^\/(?!help(?:[/?#]|$))[^/]*$/.test(from) ? from : null;
}
