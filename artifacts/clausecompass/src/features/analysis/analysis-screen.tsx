import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { AlertCircle, ArrowLeft, FileText, LoaderCircle, RotateCcw, Upload } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SkipLink } from "@/components/skip-link";
import { copy } from "@/features/journey/copy";
import { useJourney } from "@/features/journey/journey-context";
import { focusRing } from "@/lib/focus-ring";
import { cn } from "@/lib/utils";
import { describeAnalysisError, isSessionGone } from "./analysis-error";
import type { AnalysisState } from "./use-analysis-request";

export { focusRing };

/** What the status card says about each document once the response is in. */
export interface DocumentSummary {
  kind: string;
  paragraphCount: number;
  pageCount: number | null;
}

/** The screen-specific sentences; the shared ones live under copy.analysis. `names` is the file names already joined for a sentence. */
export interface AnalysisScreenWords {
  heading: string;
  lead: string;
  status: { analysing: (names: string) => string; sent: (names: string) => string };
  errors: { title: string };
}

export interface AnalysisScreenProps<T> {
  /** The files posted for this analysis, in the order the summaries come back. */
  files: File[];
  state: AnalysisState<T> & { retry: () => void };
  /** One summary per file, from the response. */
  summaries: (data: T) => DocumentSummary[];
  words: AnalysisScreenWords;
  back: { href: string; label: string; testId: string };
  /** Print only the body: the frame (back link, heading, status, footer) is for the screen. */
  printsBodyOnly?: boolean;
  /** The body once the response is in; the shell renders the status states itself. */
  children: (data: T) => ReactNode;
}

/**
 * The frame every analysis screen shares (map, review prompts, compare):
 * back link, heading, a live region for the in-flight / failed / done
 * states, the body, and the footer. Its status copy stays factual about
 * where the document is (FR-12): extracted text on ClauseCompass until the
 * session ends, passages to the AI model when an output is prepared, and
 * the response in this browser's memory (see useAnalysisRequest). A session
 * the server no longer has is an ended session, not a failure to retry: the
 * screen says so and offers the upload screen.
 */
export function AnalysisScreen<T>({ files, state, summaries, words, back, printsBodyOnly = false, children }: AnalysisScreenProps<T>) {
  const names = copy.analysis.fileNames(files.map((file) => file.name));
  const frame = printsBodyOnly ? "print:hidden" : "";
  
  return (
    <div className="flex min-h-[100dvh] flex-col font-sans bg-background">
      <SkipLink />
      <SiteHeader back={back} />

      <main id="main" className={cn("mx-auto w-full max-w-4xl flex-1 px-6 py-12 md:py-16 pb-24", printsBodyOnly && "print:max-w-none print:space-y-0 print:p-0")}>
        <div className={cn("space-y-12", frame)}>
          <div className="space-y-5 text-center max-w-3xl mx-auto">
            <h1 className="font-serif text-4xl font-medium tracking-tight text-foreground md:text-5xl">{words.heading}</h1>
            <p className="text-xl leading-relaxed text-muted-foreground">{words.lead}</p>
          </div>

          <div aria-live="polite" className="max-w-3xl mx-auto w-full">
            {state.status === "analysing" && (
              <p
                className="flex flex-col items-center justify-center gap-6 rounded-3xl border border-primary/20 bg-card p-10 text-center shadow-lg"
                data-testid="text-analysing"
              >
                <span className="relative flex items-center justify-center">
                  <span aria-hidden="true" className="absolute h-16 w-16 rounded-full border-4 border-primary/20"></span>
                  <LoaderCircle aria-hidden="true" className="h-16 w-16 animate-spin text-primary motion-reduce:animate-none" />
                </span>
                <span className="text-xl font-medium text-foreground">{words.status.analysing(names)}</span>
              </p>
            )}

            {state.status === "error" && (
              <div
                role="alert"
                className="flex flex-col items-center justify-center gap-6 rounded-3xl border-2 border-destructive/30 bg-destructive/[0.02] p-10 text-center shadow-sm"
                data-testid="text-analysis-error"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                   <AlertCircle aria-hidden="true" className="h-8 w-8 text-destructive" />
                </div>
                <div className="space-y-3">
                   <p className="text-2xl font-serif font-medium text-foreground">{words.errors.title}</p>
                   <p className="text-lg text-foreground/80 max-w-xl mx-auto">{describeAnalysisError(state.error)}</p>
                </div>
                {isSessionGone(state.error) ? (
                  <UploadAgainLink />
                ) : (
                  <button
                    type="button"
                    onClick={state.retry}
                    data-testid="button-retry-analysis"
                    className={`inline-flex min-h-[56px] items-center gap-3 rounded-2xl bg-primary px-8 text-lg font-semibold text-primary-foreground transition-colors hover:bg-primary/90 hover:shadow-md ${focusRing}`}
                  >
                    <RotateCcw aria-hidden="true" className="h-6 w-6" />
                    {copy.analysis.errors.retry}
                  </button>
                )}
              </div>
            )}

            {state.status === "ready" && <DocumentStatus files={files} summaries={summaries(state.data)} sent={words.status.sent(names)} />}
          </div>
        </div>

        {state.status === "ready" && <div className="mt-16 print:mt-0">{children(state.data)}</div>}
      </main>

      <SiteFooter className={frame} />
    </div>
  );
}

/** The way on from an ended session: forget it here, then the upload screen, where the chosen files are still waiting. */
function UploadAgainLink() {
  const { forgetSession } = useJourney();
  const [, navigate] = useLocation();
  return (
    <button
      type="button"
      onClick={() => {
        forgetSession();
        navigate("/upload");
      }}
      data-testid="button-upload-again"
      className={`inline-flex min-h-[56px] items-center gap-3 rounded-2xl bg-primary px-8 text-lg font-semibold text-primary-foreground transition-colors hover:bg-primary/90 hover:shadow-md ${focusRing}`}
    >
      <Upload aria-hidden="true" className="h-6 w-6" />
      {copy.analysis.errors.uploadAgain}
    </button>
  );
}

function DocumentStatus({ files, summaries, sent }: { files: File[]; summaries: DocumentSummary[]; sent: string }) {
  return (
    <div className="flex flex-col gap-6 rounded-3xl border border-border bg-card p-6 md:p-8 shadow-sm" data-testid="text-analysis-status">
      <ul className="flex min-w-0 flex-col gap-4">
        {files.map((file, index) => {
          const summary = summaries[index];
          return (
            <li key={`${index}-${file.name}`} className="flex min-w-0 items-center gap-4 rounded-2xl border border-border/50 bg-muted/30 p-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-card shadow-sm">
                <FileText aria-hidden="true" className="h-6 w-6 text-primary" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-lg font-semibold text-foreground [overflow-wrap:anywhere]">{file.name}</span>
                {summary && (
                  <span className="mt-0.5 text-sm font-medium text-muted-foreground" data-testid="text-document-summary">
                    {copy.analysis.documentSummary(summary.kind, summary.paragraphCount, summary.pageCount)}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-border/60 pt-5">
        <p className="text-base leading-relaxed text-foreground/80">{sent}</p>
      </div>
    </div>
  );
}

/** A link styled as the screen's one forward action, e.g. map → review prompts. */
export function ContinueLink({ href, label, testId }: { href: string; label: string; testId: string }) {
  return (
    <div className="flex justify-end pt-12 print:hidden">
      <Link
        href={href}
        data-testid={testId}
        className={`inline-flex min-h-[64px] items-center gap-4 rounded-2xl bg-primary px-8 text-xl font-semibold text-primary-foreground transition-colors hover:bg-primary/90 hover:shadow-lg hover:-translate-y-0.5 ${focusRing}`}
      >
        {label}
        <ArrowLeft className="h-6 w-6 rotate-180" aria-hidden="true" />
      </Link>
    </div>
  );
}