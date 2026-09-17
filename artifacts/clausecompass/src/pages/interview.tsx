import { useId, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { ArrowRight, FileText, MessageSquareText } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SkipLink } from "@/components/skip-link";
import { slotToAnalyse } from "@/features/analysis/select-document";
import { slotsForStage } from "@/features/document/slots";
import { copy } from "@/features/journey/copy";
import { nextScreen } from "@/features/journey/flow";
import { useJourney } from "@/features/journey/journey-context";
import { SAMPLE_ANSWERS, type SampleAnswer } from "@/features/journey/sample-answers";
import { focusRing } from "@/lib/focus-ring";
import { formatBytes } from "@/lib/format";

/** Enough for a few sentences; the safety scan is regular expressions over the whole text, so the length is bounded here. */
const SITUATION_MAX_LENGTH = 1000;

/**
 * The context interview (PRD §5 step 3). Today it asks one open question:
 * whatever the reader types is run through the decision flow (PRD §8) here
 * in the browser when they press Continue, and the flow picks the next
 * screen — the document map, or the safety screen when the words mention
 * harm to a person. The rest of the interview (the stage's own questions)
 * is a later task and slots in below the same question. RequireStage and
 * RequireDocuments wrap this screen in the router, so the session the upload
 * screen opened is present, and this screen is where the reader first hears
 * what it means (FR-12).
 */
export default function Interview() {
  const { stage, documents, session, say } = useJourney();
  const [, navigate] = useLocation();
  const [situation, setSituation] = useState("");
  const [sampleStatus, setSampleStatus] = useState<string | null>(null);
  const situationId = useId();
  const hintId = `${situationId}-hint`;
  if (stage === null || session === null) return null;
  const slots = slotsForStage(stage);
  const words = copy.interview;

  /** Every way onward runs the words through the flow first; an escalation replaces this entry so Back does not return to the question. */
  function goOn(intended: "/map" | "/compare") {
    const decision = say(situation);
    const destination = nextScreen(decision, intended);
    navigate(destination, { replace: destination !== intended });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    goOn("/map");
  }

  function fillSample(sample: SampleAnswer) {
    setSituation(sample.text);
    setSampleStatus(words.situation.samples.loaded(sample.title));
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background font-sans">
      <SkipLink />
      <SiteHeader back={{ href: "/upload", label: words.back, testId: "link-back-to-upload" }} />

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 space-y-12 px-6 py-12 md:py-16">
        <h1 className="font-serif text-4xl font-medium tracking-tight text-foreground md:text-5xl">{words.heading}</h1>

        <section
          aria-labelledby="documents-ready-heading"
          className="space-y-4 rounded-3xl border border-border/80 bg-card p-6 shadow-sm md:p-8"
        >
          <h2 id="documents-ready-heading" className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            {words.documentsLabel}
          </h2>
          <ul className="space-y-3">
            {slots.map((slot) => {
              const file = documents[slot.id];
              if (!file) return null;
              return (
                <li
                  key={slot.id}
                  className="flex items-center gap-4 rounded-2xl border border-border/80 bg-background p-4"
                  data-testid={`text-ready-file-${slot.id}`}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <FileText aria-hidden="true" className="h-6 w-6 text-primary" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-lg font-medium text-foreground">{file.name}</span>
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {slots.length > 1 ? `${slot.label} · ` : ""}
                    {formatBytes(file.size)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <p className="max-w-prose text-lg leading-relaxed text-muted-foreground" data-testid="text-interview-placeholder">
          {words.placeholder(session.ttlMinutes)}
        </p>

        <form onSubmit={onSubmit} noValidate className="space-y-10" data-testid="form-interview">
          <section
            aria-labelledby={`${situationId}-label`}
            className="space-y-5 rounded-3xl border border-border/80 bg-card p-6 shadow-sm md:p-8"
          >
            <label
              id={`${situationId}-label`}
              htmlFor={situationId}
              className="block text-2xl md:text-3xl font-serif font-medium text-foreground"
            >
              {words.situation.label}
            </label>
            <p id={hintId} className="max-w-prose text-base leading-relaxed text-muted-foreground">
              {words.situation.hint}
            </p>
            <textarea
              id={situationId}
              name="situation"
              value={situation}
              onChange={(event) => setSituation(event.target.value)}
              maxLength={SITUATION_MAX_LENGTH}
              rows={4}
              autoComplete="off"
              aria-describedby={hintId}
              data-testid="input-situation"
              className={`block w-full rounded-2xl border-2 border-border bg-background px-4 py-3 text-lg leading-relaxed text-foreground transition-colors hover:border-primary/40 placeholder:text-muted-foreground ${focusRing}`}
            />

            <div className="space-y-3 border-t border-border/60 pt-6">
              <h3 className="text-base font-semibold text-foreground">{words.situation.samples.heading}</h3>
              <p className="max-w-prose text-base text-muted-foreground">{words.situation.samples.lead}</p>
              <ul className="flex flex-wrap gap-2" aria-label={words.situation.samples.heading}>
                {SAMPLE_ANSWERS.map((sample) => (
                  <li key={sample.id}>
                    <button
                      type="button"
                      onClick={() => fillSample(sample)}
                      aria-label={`${words.situation.samples.use}: ${sample.title}`}
                      data-testid={`button-sample-answer-${sample.id}`}
                      className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-border bg-background px-4 text-base font-medium text-foreground transition-colors hover:border-primary/60 hover:bg-primary/5 ${focusRing}`}
                    >
                      <MessageSquareText aria-hidden="true" className="h-4 w-4 text-primary" />
                      {sample.title}
                    </button>
                  </li>
                ))}
              </ul>
              <p aria-live="polite" className={sampleStatus ? "text-base font-medium text-foreground" : "sr-only"} data-testid="status-sample-answer">
                {sampleStatus ?? ""}
              </p>
            </div>
          </section>

          <div className="space-y-3">
            <button
              type="submit"
              data-testid="button-continue-to-map"
              className={`inline-flex min-h-[56px] items-center gap-3 rounded-2xl bg-primary px-8 text-lg font-semibold text-primary-foreground shadow-md transition-colors hover:bg-primary/90 ${focusRing}`}
            >
              {words.continueToMap}
              <ArrowRight aria-hidden="true" className="h-5 w-5" />
            </button>
            <p className="max-w-prose text-base leading-relaxed text-muted-foreground" data-testid="text-continue-note">
              {words.continueNote(copy.upload.slotPhrases[slotToAnalyse(stage)])}
            </p>
          </div>

          {stage === "compare-versions" && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => goOn("/compare")}
                data-testid="button-continue-to-compare"
                className={`inline-flex min-h-[48px] items-center gap-2 rounded-2xl border-2 border-primary bg-card px-6 text-base font-semibold text-primary transition-colors hover:bg-primary/10 ${focusRing}`}
              >
                {words.goToCompare}
                <ArrowRight aria-hidden="true" className="h-5 w-5" />
              </button>
              <p className="max-w-prose text-base leading-relaxed text-muted-foreground" data-testid="text-compare-note">
                {words.goToCompareNote}
              </p>
            </div>
          )}
        </form>
      </main>

      <SiteFooter />
    </div>
  );
}
