import { useId, useMemo } from "react";
import { Redirect } from "wouter";
import { FileCheck2, GitCompareArrows } from "lucide-react";
import type { ChangeKind, CompareResponse } from "@workspace/api-client-react";
import { AnalysisScreen, ContinueLink } from "@/features/analysis/analysis-screen";
import { ChangeCard, kindLabel } from "@/features/analysis/change-card";
import { useCompare } from "@/features/analysis/use-compare";
import { copy } from "@/features/journey/copy";
import { useJourney } from "@/features/journey/journey-context";

const KIND_ORDER: readonly ChangeKind[] = ["money", "time", "duty", "remedy", "wording"];

/**
 * The Compare screen (PRD §5 step 6; FR-07): the session's two versions
 * lined up, one change card per paragraph that differs. RequireStage and
 * RequireDocuments guarantee the stage's documents and the session; a
 * journey that is not a version comparison has no older and newer file, so
 * it goes to the map.
 */
export default function ComparePage() {
  const { stage, documents, session } = useJourney();
  if (stage === null || session === null) return null;
  const { older, newer } = documents;
  if (!older || !newer) return <Redirect to="/map" replace />;
  return <CompareScreen older={older} newer={newer} sessionId={session.id} />;
}

function CompareScreen({ older, newer, sessionId }: { older: File; newer: File; sessionId: string }) {
  const state = useCompare(sessionId);
  const words = copy.compare;
  const files = useMemo(() => [older, newer], [older, newer]);
  return (
    <AnalysisScreen
      files={files}
      state={state}
      summaries={(data) => [data.older.document, data.newer.document]}
      words={words}
      back={{ href: "/review", label: words.back, testId: "link-back-to-review" }}
    >
      {(data) => (
        <>
          <CompareBody data={data} />
          <ContinueLink href="/packet" label={words.continueToPacket} testId="link-continue-to-packet" />
        </>
      )}
    </AnalysisScreen>
  );
}

function CompareBody({ data }: { data: CompareResponse }) {
  if (data.changes.length === 0) return <EmptyState unchanged={data.unchanged} />;
  return (
    <div className="space-y-16">
      <Summary data={data} />
      <section aria-label={copy.compare.heading} className="space-y-8" data-testid="section-changes">
        {data.changes.map((change) => (
          <ChangeCard key={change.id} change={change} />
        ))}
      </section>
      <div className="pt-8 border-t border-border/60">
         <p className="max-w-2xl mx-auto text-center text-lg leading-relaxed text-muted-foreground" data-testid="text-compare-note">
           {copy.compare.note}
         </p>
      </div>
    </div>
  );
}

/** The counts at a glance: how many changes, of what kind, and how much of the document is the same. */
function Summary({ data }: { data: CompareResponse }) {
  const headingId = useId();
  const words = copy.compare.summary;
  const added = data.changes.filter((change) => change.status === "added").length;
  const removed = data.changes.filter((change) => change.status === "removed").length;
  const kinds = KIND_ORDER.filter((kind) => data.byKind[kind] > 0);
  return (
    <section aria-labelledby={headingId} className="flex flex-col md:flex-row gap-8 items-start md:items-center rounded-3xl border border-border/80 bg-card p-8 md:p-10 shadow-sm" data-testid="section-summary">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 shrink-0">
         <GitCompareArrows className="h-8 w-8 text-primary" aria-hidden="true" />
      </div>
      <div className="space-y-5 flex-1">
         <h2 id={headingId} className="font-serif text-3xl font-medium tracking-tight text-foreground">
           {words.title}
         </h2>
         <p className="text-2xl font-semibold text-foreground" data-testid="text-change-count">
           {words.changes(data.changes.length)}
         </p>
         {/* One sentence for a screen reader (the separators are read, not shown); on screen its parts are chips. */}
         <p className="flex flex-wrap items-center gap-3 text-lg font-medium" data-testid="text-unchanged">
           <span className="rounded-xl border border-border/80 bg-muted px-4 py-2 text-foreground">{words.unchanged(data.unchanged)}</span>
           {added > 0 && (
             <>
               <span className="sr-only"> · </span>
               <span className="rounded-xl border border-family-money/30 bg-family-money/10 px-4 py-2 text-family-money">{words.added(added)}</span>
             </>
           )}
           {removed > 0 && (
             <>
               <span className="sr-only"> · </span>
               <span className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2 text-destructive">{words.removed(removed)}</span>
             </>
           )}
         </p>
         <ul className="flex flex-wrap gap-3 pt-2" data-testid="list-by-kind">
           {kinds.map((kind) => (
             <li key={kind} className="rounded-lg border border-border/80 bg-muted/40 px-3 py-1.5 text-base font-medium text-muted-foreground" data-testid={`text-count-${kind}`}>
               {words.byKind(kindLabel(kind), data.byKind[kind])}
             </li>
           ))}
         </ul>
      </div>
    </section>
  );
}

function EmptyState({ unchanged }: { unchanged: number }) {
  const titleId = useId();
  const words = copy.compare.empty;
  return (
    <article
      aria-labelledby={titleId}
      data-testid="text-compare-empty"
      className="flex flex-col sm:flex-row items-start sm:items-center gap-6 rounded-3xl border-2 border-dashed border-border/80 bg-muted/20 p-8 md:p-10 shadow-sm"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-card border border-border/80 shadow-sm shrink-0">
         <FileCheck2 aria-hidden="true" className="h-8 w-8 text-primary" />
      </div>
      <div className="space-y-2 flex-1 min-w-0">
         <p id={titleId} className="text-2xl font-serif font-medium text-foreground tracking-tight">
           {words.title}
         </p>
         <p className="text-lg leading-relaxed text-muted-foreground max-w-2xl">{words.body}</p>
         <p className="text-base font-medium text-foreground/80 pt-2" data-testid="text-unchanged">
           {copy.compare.summary.unchanged(unchanged)}
         </p>
      </div>
    </article>
  );
}