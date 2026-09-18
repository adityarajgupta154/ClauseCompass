import { useId, useMemo } from "react";
import { FileQuestion } from "lucide-react";
import type { HitRelevance, ReviewPrompt, ReviewPromptAbsence, ReviewPromptsResponse } from "@workspace/api-client-react";
import { AnalysisScreen, ContinueLink } from "@/features/analysis/analysis-screen";
import { FamilyBadge } from "@/features/analysis/family-badge";
import { ReviewPromptCard } from "@/features/analysis/review-prompt-card";
import { documentToAnalyse } from "@/features/analysis/select-document";
import { useReviewPrompts } from "@/features/analysis/use-review-prompts";
import { indexChunks, resolveClaim, type ChunkIndex } from "@/features/grounding/resolve-claim";
import { copy } from "@/features/journey/copy";
import { useJourney } from "@/features/journey/journey-context";
import type { StageId } from "@/features/journey/stages";
import { ReadAloudButton } from "@/features/speech/read-aloud-button";

const GROUPS: readonly HitRelevance[] = ["primary", "secondary", "background"];

/**
 * The Review Prompts screen (PRD §5 step 5; FR-06). Same entry conditions
 * as the map: RequireStage and RequireDocuments guarantee a stage, a file
 * and a session; the prompts are prepared the first time this screen opens
 * in a session and reused after that (see useAnalysisRequest).
 */
export default function ReviewPromptsPage() {
  const { stage, documents, session } = useJourney();
  if (stage === null || session === null) return null;
  const file = documentToAnalyse(stage, documents);
  if (file === null) return null;
  return <ReviewPromptsScreen file={file} stage={stage} sessionId={session.id} />;
}

function ReviewPromptsScreen({ file, stage, sessionId }: { file: File; stage: StageId; sessionId: string }) {
  const state = useReviewPrompts(sessionId);
  const words = copy.review;
  const files = useMemo(() => [file], [file]);
  return (
    <AnalysisScreen
      files={files}
      state={state}
      summaries={(data) => [data.document]}
      words={words}
      back={{ href: "/map", label: words.back, testId: "link-back-to-map" }}
    >
      {(data) => (
        <>
          <ReviewBody data={data} />
          {stage === "compare-versions" ? (
            <ContinueLink href="/compare" label={words.continueToCompare} testId="link-continue-to-compare" secondary={{ href: "/ask", label: copy.ask.link, testId: "link-ask-document" }} />
          ) : (
            <ContinueLink href="/packet" label={words.continueToPacket} testId="link-continue-to-packet" secondary={{ href: "/ask", label: copy.ask.link, testId: "link-ask-document" }} />
          )}
        </>
      )}
    </AnalysisScreen>
  );
}

function ReviewBody({ data }: { data: ReviewPromptsResponse }) {
  const chunks = useMemo(() => indexChunks(data.chunks), [data.chunks]);
  const byRelevance = useMemo(() => {
    const groups = new Map<HitRelevance, ReviewPrompt[]>(GROUPS.map((relevance) => [relevance, []]));
    for (const prompt of data.prompts) groups.get(prompt.relevance)?.push(prompt);
    return groups;
  }, [data.prompts]);

  if (data.prompts.length === 0) {
    return (
      <div className="space-y-16">
        <EmptyState />
        <NotFoundSection absences={data.notFound} />
      </div>
    );
  }

  return (
    <div className="space-y-20">
      <div className="flex flex-wrap justify-end gap-3 pb-4 border-b border-border/60">
        <ReadAloudButton pieces={reviewReading(byRelevance, chunks)} label={copy.readAloud.whole.review} testId="button-read-aloud-all" />
      </div>
      <div className="space-y-24">
        {GROUPS.map((relevance) => (
          <PromptGroup key={relevance} relevance={relevance} prompts={byRelevance.get(relevance) ?? []} chunks={chunks} />
        ))}
      </div>
      {data.withheld > 0 && (
        <p className="text-lg font-medium leading-relaxed text-foreground/80 mt-8 bg-muted/40 p-5 rounded-2xl border border-border/80 text-center max-w-2xl mx-auto" data-testid="text-withheld">
          {copy.review.withheld(data.withheld)}
        </p>
      )}
      <div className="pt-16 mt-16 border-t-[6px] border-border/40">
        <NotFoundSection absences={data.notFound} />
      </div>
    </div>
  );
}

/**
 * The prompts as they are shown, for reading aloud: each group's title, then
 * every prompt's name, why it matters and the question, in the order of the
 * screen. A question the screen withholds (its card shows the "not shown"
 * state) is not read.
 */
export function reviewReading(byRelevance: Map<HitRelevance, ReviewPrompt[]>, chunks: ChunkIndex): string[] {
  const pieces: string[] = [];
  for (const relevance of GROUPS) {
    const prompts = byRelevance.get(relevance) ?? [];
    if (prompts.length === 0) continue;
    pieces.push(`${copy.review.groups[relevance].title}.`);
    for (const prompt of prompts) {
      pieces.push(`${prompt.title}. ${prompt.whyItMatters}`);
      const resolved = resolveClaim(prompt.prompt, chunks);
      if (resolved.status !== "ungrounded") pieces.push(resolved.claim.text);
    }
  }
  return pieces;
}

function PromptGroup({ relevance, prompts, chunks }: { relevance: HitRelevance; prompts: ReviewPrompt[]; chunks: ChunkIndex }) {
  const headingId = useId();
  if (prompts.length === 0) return null;
  const words = copy.review.groups[relevance];
  return (
    <section aria-labelledby={headingId} className="space-y-8" data-testid={`section-review-${relevance}`}>
      <div className="space-y-3">
        <h2 id={headingId} className="font-serif text-3xl md:text-4xl font-medium tracking-tight text-foreground">
          {words.title}
        </h2>
        <p className="max-w-prose text-xl leading-relaxed text-muted-foreground">{words.description}</p>
      </div>
      <div className="space-y-8 pt-4">
        {prompts.map((prompt) => (
          <ReviewPromptCard key={prompt.ruleId} prompt={prompt} chunks={chunks} />
        ))}
      </div>
    </section>
  );
}

/**
 * The leading rules that matched nothing, as a visible list rather than an
 * omission: a reader can see which clauses they might have expected here.
 */
function NotFoundSection({ absences }: { absences: ReviewPromptAbsence[] }) {
  const headingId = useId();
  if (absences.length === 0) return null;
  const words = copy.review.notFound;
  return (
    <section aria-labelledby={headingId} className="space-y-8 bg-muted/20 border border-border/50 rounded-3xl p-8 md:p-10 shadow-sm" data-testid="section-review-not-found">
      <div className="space-y-4 max-w-2xl">
        <h2 id={headingId} className="font-serif text-3xl font-medium tracking-tight text-foreground">
          {words.title}
        </h2>
        <p className="text-lg leading-relaxed text-muted-foreground">{words.description}</p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 pt-4" data-testid="list-not-found">
        {absences.map((absent) => (
          <li
            key={absent.ruleId}
            data-testid={`item-not-found-${absent.ruleId}`}
            className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border/80 bg-card p-5 shadow-sm transition-shadow hover:shadow-md hover:border-primary/30"
          >
            <FamilyBadge family={absent.family} className="self-start" />
            <span className="text-lg font-semibold text-foreground leading-snug [overflow-wrap:anywhere]">{absent.title}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Zero rules fired: said plainly, never dressed up as a clean bill of health. */
function EmptyState() {
  const titleId = useId();
  const words = copy.review.empty;
  return (
    <article
      aria-labelledby={titleId}
      data-testid="text-review-empty"
      className="flex flex-col md:flex-row md:items-center gap-6 rounded-3xl border-2 border-dashed border-border/80 bg-muted/20 p-8 md:p-10 shadow-sm"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-card border border-border/80 shadow-sm shrink-0">
         <FileQuestion aria-hidden="true" className="h-8 w-8 text-primary" />
      </div>
      <div className="space-y-2 flex-1 min-w-0">
        <p id={titleId} className="text-2xl font-serif font-medium text-foreground tracking-tight min-w-0 [overflow-wrap:anywhere]">
          {words.title}
        </p>
        <p className="text-lg leading-relaxed text-muted-foreground max-w-2xl">{words.body}</p>
      </div>
    </article>
  );
}