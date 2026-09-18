import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { AlertCircle, FileQuestion, LoaderCircle, MessageSquareText, RotateCcw, Send } from "lucide-react";
import type { AskResponse } from "@workspace/api-client-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SkipLink } from "@/components/skip-link";
import { describeAnalysisError, isSessionGone } from "@/features/analysis/analysis-error";
import { UploadAgainLink } from "@/features/analysis/analysis-screen";
import { documentToAnalyse } from "@/features/analysis/select-document";
import { useAsk, type Exchange } from "@/features/ask/use-ask";
import { indexChunks } from "@/features/grounding/resolve-claim";
import { SourceCard } from "@/features/grounding/source-card";
import { copy } from "@/features/journey/copy";
import { nextScreen } from "@/features/journey/flow";
import { useJourney } from "@/features/journey/journey-context";
import { HelpLink } from "@/features/resources/help-link";
import { ReadAloudButton } from "@/features/speech/read-aloud-button";
import { focusRing } from "@/lib/focus-ring";

/** The API's cap (Question.maxLength in the OpenAPI document); the field stops the reader at the same place. */
export const QUESTION_MAX_LENGTH = 500;

const card = "rounded-3xl border border-border/80 bg-card p-6 shadow-sm md:p-8";
const chip = `inline-flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-border bg-background px-4 text-left text-base font-medium text-foreground transition-colors [overflow-wrap:anywhere] hover:border-primary/60 hover:bg-primary/5 ${focusRing}`;

/**
 * Ask about this document (PRD section 5 step 5, FR-08; section 8 "Question
 * unsupported by the document"). The reader types a question; the words go
 * through the decision flow here first, as the interview's do (a safety cue
 * sets the document aside and opens the safety screen instead of sending
 * anything), then to the API, which answers from the paragraphs that share
 * the question's words or says the document does not answer it. Every
 * statement in an answer is a SourceCard, so its exact wording is one
 * disclosure away; a refusal hands the question back for a professional.
 * Same entry conditions as the map: RequireStage and RequireDocuments
 * guarantee a stage, a file and a session.
 */
export default function AskPage() {
  const { stage, documents, session } = useJourney();
  if (stage === null || session === null) return null;
  const file = documentToAnalyse(stage, documents);
  if (file === null) return null;
  return <AskScreen file={file} sessionId={session.id} />;
}

function AskScreen({ file, sessionId }: { file: File; sessionId: string }) {
  const { say } = useJourney();
  const [, navigate] = useLocation();
  const { thread, busy, ask, retry } = useAsk(sessionId);
  const [question, setQuestion] = useState("");
  const [sampleStatus, setSampleStatus] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const questionId = useId();
  const hintId = `${questionId}-hint`;
  const words = copy.ask;
  const typed = question.trim();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (typed === "" || busy) return;
    // The flow reads the words first; an escalation replaces this entry so Back does not return to the question.
    const decision = say(typed, "question");
    const destination = nextScreen(decision, "/ask");
    if (destination !== "/ask") {
      navigate(destination, { replace: true });
      return;
    }
    ask(typed, decision.answerStyle);
    setQuestion("");
    setSampleStatus(null);
    field.current?.focus();
  }

  function fillSample(sample: string) {
    setQuestion(sample);
    setSampleStatus(sample);
    field.current?.focus();
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background font-sans">
      <SkipLink />
      <SiteHeader back={{ href: "/map", label: words.back, testId: "link-back-to-map" }} />

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 space-y-12 px-6 py-12 md:py-16">
        <div className="space-y-5">
          <h1 className="font-serif text-4xl font-medium tracking-tight text-foreground md:text-5xl">{words.heading}</h1>
          <p className="max-w-prose text-xl leading-relaxed text-muted-foreground">{words.lead}</p>
          <p className="flex items-center gap-3 text-base text-muted-foreground" data-testid="text-ask-document">
            <FileQuestion aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
            <span className="min-w-0 truncate font-medium text-foreground">{file.name}</span>
          </p>
        </div>

        <form onSubmit={onSubmit} noValidate className="space-y-8" data-testid="form-ask">
          <section aria-labelledby={`${questionId}-label`} className={`space-y-5 ${card}`}>
            <label id={`${questionId}-label`} htmlFor={questionId} className="block font-serif text-2xl font-medium text-foreground md:text-3xl">
              {words.question.label}
            </label>
            <p id={hintId} className="max-w-prose text-base leading-relaxed text-muted-foreground">
              {words.question.hint(QUESTION_MAX_LENGTH)}
            </p>
            <textarea
              ref={field}
              id={questionId}
              name="question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={QUESTION_MAX_LENGTH}
              rows={3}
              autoComplete="off"
              aria-describedby={hintId}
              data-testid="input-question"
              className={`block w-full rounded-2xl border-2 border-border bg-background px-4 py-3 text-lg leading-relaxed text-foreground transition-colors hover:border-primary/40 ${focusRing}`}
            />
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="submit"
                disabled={busy || typed === ""}
                aria-disabled={busy || typed === ""}
                data-testid="button-ask"
                className={`inline-flex min-h-[56px] items-center gap-3 rounded-2xl bg-primary px-8 text-lg font-semibold text-primary-foreground shadow-md transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`}
              >
                <Send aria-hidden="true" className="h-5 w-5" />
                {words.question.ask}
              </button>
              <span className="text-sm text-muted-foreground" data-testid="text-question-length">
                {question.length}/{QUESTION_MAX_LENGTH}
              </span>
            </div>

            <div className="space-y-3 border-t border-border/60 pt-6">
              <h2 className="text-base font-semibold text-foreground">{words.question.samples.heading}</h2>
              <ul className="flex flex-wrap gap-2" aria-label={words.question.samples.heading}>
                {words.question.sampleQuestions.map((sample, index) => (
                  <li key={sample}>
                    <button
                      type="button"
                      onClick={() => fillSample(sample)}
                      aria-label={`${words.question.samples.use}: ${sample}`}
                      data-testid={`button-sample-question-${index + 1}`}
                      className={chip}
                    >
                      <MessageSquareText aria-hidden="true" className="h-4 w-4 text-primary" />
                      {sample}
                    </button>
                  </li>
                ))}
              </ul>
              <p aria-live="polite" className={sampleStatus ? "text-base font-medium text-foreground" : "sr-only"} data-testid="status-sample-question">
                {sampleStatus ?? ""}
              </p>
            </div>
          </section>
        </form>

        <section aria-labelledby="ask-thread-heading" className="space-y-6" data-testid="section-ask-thread">
          <h2 id="ask-thread-heading" className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            {words.thread.heading}
          </h2>
          <p className="max-w-prose text-base leading-relaxed text-muted-foreground" data-testid="text-ask-thread-note">
            {words.thread.note}
          </p>
          <ol aria-live="polite" className="space-y-8">
            {thread.map((exchange) => (
              <ExchangeCard key={exchange.id} exchange={exchange} retry={() => retry(exchange.id)} />
            ))}
          </ol>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function ExchangeCard({ exchange, retry }: { exchange: Exchange; retry: () => void }) {
  const id = useId();
  const words = copy.ask;
  return (
    <li className={`space-y-6 ${card}`} aria-labelledby={`${id}-question`} data-testid="text-ask-exchange">
      <div className="space-y-2">
        <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">{words.thread.asked}</p>
        <p id={`${id}-question`} className="font-serif text-2xl font-medium text-foreground [overflow-wrap:anywhere]" data-testid="text-ask-question">
          {exchange.question}
        </p>
      </div>

      {exchange.status === "asking" && (
        <p className="flex items-center gap-4 rounded-2xl border border-primary/20 bg-background p-5" data-testid="text-asking">
          <LoaderCircle aria-hidden="true" className="h-8 w-8 shrink-0 animate-spin text-primary motion-reduce:animate-none" />
          <span className="text-lg text-foreground">{words.question.asking}</span>
        </p>
      )}

      {exchange.status === "failed" && (
        <div role="alert" className="space-y-5 rounded-2xl border-2 border-destructive/30 bg-destructive/[0.02] p-5" data-testid="text-ask-error">
          <div className="flex items-start gap-4">
            <AlertCircle aria-hidden="true" className="mt-1 h-6 w-6 shrink-0 text-destructive" />
            <div className="space-y-2">
              <p className="text-xl font-medium text-foreground">{words.errors.title}</p>
              <p className="text-lg text-foreground/80">{describeAnalysisError(exchange.error)}</p>
            </div>
          </div>
          {isSessionGone(exchange.error) ? (
            <UploadAgainLink />
          ) : (
            <button
              type="button"
              onClick={retry}
              data-testid="button-retry-ask"
              className={`inline-flex min-h-[48px] items-center gap-2 rounded-2xl border-2 border-primary bg-card px-6 text-base font-semibold text-primary transition-colors hover:bg-primary/10 ${focusRing}`}
            >
              <RotateCcw aria-hidden="true" className="h-5 w-5" />
              {words.errors.retry}
            </button>
          )}
        </div>
      )}

      {exchange.status === "answered" && <AnswerBody answer={exchange.answer} questionId={`${id}-question`} />}
    </li>
  );
}

function AnswerBody({ answer, questionId }: { answer: AskResponse; questionId: string }) {
  const id = useId();
  const words = copy.ask;
  const chunks = useMemo(() => indexChunks(answer.passages), [answer.passages]);

  if (answer.status === "not-in-document") {
    const reason = answer.reason ?? "nothing-verified";
    return (
      <div className="space-y-5" data-testid="text-not-in-document">
        <h3 id={`${id}-title`} className="text-xl font-semibold text-foreground">
          {words.notInDocument.title}
        </h3>
        <p className="max-w-prose text-lg leading-relaxed text-foreground/80" data-testid="text-not-in-document-reason">
          {words.notInDocument.reasons[reason]}
        </p>
        {answer.suggestedQuestion !== null && (
          <div className="space-y-3 rounded-2xl border border-border/80 bg-background p-5">
            <p className="text-base font-semibold text-foreground">{words.notInDocument.takeIt}</p>
            <blockquote className="border-l-4 border-primary/40 pl-4 font-serif text-xl text-foreground [overflow-wrap:anywhere]" data-testid="text-suggested-question">
              {answer.suggestedQuestion}
            </blockquote>
            <HelpLink concern="legal-advice" testId="link-ask-help" className={`inline-flex min-h-[44px] items-center text-base font-semibold text-primary underline-offset-4 hover:underline ${focusRing}`}>
              {words.notInDocument.help}
            </HelpLink>
          </div>
        )}
      </div>
    );
  }

  const claimsId = `${id}-claims`;
  return (
    <div className="space-y-5" data-testid="text-answer">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 id={claimsId} className="text-xl font-semibold text-foreground">
          {words.answer.heading}
        </h3>
        <ReadAloudButton
          pieces={answer.claims.map((claim) => claim.text)}
          label={words.answer.readAloud}
          describedBy={questionId}
          testId="button-read-answer-aloud"
        />
      </div>
      {answer.style === "brief" && (
        <p className="max-w-prose text-base leading-relaxed text-muted-foreground" data-testid="text-answer-brief">
          {words.answer.brief}
        </p>
      )}
      <ul aria-labelledby={claimsId} className="space-y-4">
        {answer.claims.map((claim, index) => (
          <li key={`${index}-${claim.quote}`}>
            <SourceCard claim={claim} chunks={chunks} defaultOpen={index === 0} />
          </li>
        ))}
      </ul>
      {answer.withheld > 0 && (
        <p className="max-w-prose text-base leading-relaxed text-muted-foreground" data-testid="text-ask-withheld">
          {words.answer.withheld(answer.withheld)}
        </p>
      )}
    </div>
  );
}
