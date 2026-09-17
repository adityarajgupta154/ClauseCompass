import { useId, useState } from "react";
import { AlertTriangle, ChevronDown, EyeOff, FileText } from "lucide-react";
import type { Claim } from "@workspace/grounding";
import { copy } from "@/features/journey/copy";
import { ReadAloudButton } from "@/features/speech/read-aloud-button";
import { cn } from "@/lib/utils";
import { formatLocation } from "./format-location";
import { resolveClaim, type ChunkIndex, type UngroundedReason } from "./resolve-claim";
import { focusRing } from "@/lib/focus-ring";

// [overflow-wrap:anywhere] only matters at extreme text sizes on narrow screens,
// where breaking a word beats pushing the page sideways.
const buttonClass =
  `inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-xl border-2 border-border bg-background px-4 text-left text-base font-semibold text-foreground transition-colors [overflow-wrap:anywhere] hover:border-primary/60 hover:text-primary ${focusRing}`;

const topicClass = "text-sm font-bold uppercase tracking-widest text-muted-foreground";

export type SourceCardProps = {
  claim: Claim;
  /** Every chunk the claim may cite, built once per document with indexChunks(). */
  chunks: ChunkIndex;
  /** Reader-facing label for claim.category, e.g. "Notice period". Also named in the fallback. */
  topic?: string;
  /** Start with the source excerpt(s) visible (print and packet views). */
  defaultOpen?: boolean;
  className?: string;
};

/**
 * The citation primitive (PRD section 5 step 5, section 8). Renders one
 * plain-language claim with a disclosure that reveals the exact wording it
 * rests on and where that wording sits in the document. A claim with no
 * usable citation is never rendered: the reader sees an explicit
 * "not shown" state in its place, so a withheld statement is visible as
 * withheld rather than silently missing.
 */
export function SourceCard({ claim, chunks, topic, defaultOpen = false, className }: SourceCardProps) {
  const id = useId();
  const [open, setOpen] = useState(defaultOpen);
  // Resolved on every render on purpose: memoising on object identity would let
  // an in-place mutation (citations emptied on a retained object) reuse an old
  // "grounded" result. The check is a map lookup per citation; it is cheap.
  const resolved = resolveClaim(claim, chunks);

  if (resolved.status === "ungrounded") {
    return <UngroundedFallback reason={resolved.reason} topic={topic} className={className} />;
  }

  const { excerpts, unresolvedIds, lowConfidence } = resolved;
  const claimId = `${id}-claim`;
  const topicId = `${id}-topic`;
  const panelId = `${id}-source`;
  const words = copy.sourceCard;
  const primary = excerpts[0];
  const others = excerpts.length - 1;

  return (
    <article
      aria-labelledby={claimId}
      data-testid="source-card"
      className={cn(
        "min-w-0 flex flex-col gap-5 rounded-3xl border border-border/80 bg-card p-6 md:p-8 shadow-sm transition-shadow hover:shadow-md",
        className,
      )}
    >
      {topic && (
        <p id={topicId} className={topicClass} data-testid="text-topic">
          {topic}
        </p>
      )}

      {/* The statement is prepared in English whatever language the screen shows (it is never translated), so it says so for a screen reader. */}
      <p
        id={claimId}
        lang="en"
        className="text-xl leading-relaxed text-foreground md:text-2xl font-medium"
        data-testid="text-claim"
      >
        {resolved.claim.text}
      </p>

      {lowConfidence && (
        <div className="flex items-start gap-3 rounded-2xl bg-primary/[0.03] border border-primary/20 p-4">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
          <p className="text-base font-medium text-foreground/90" data-testid="text-low-confidence">
            {words.lowConfidence}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-4 pt-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          // Every card's toggle reads "Show source"; the topic (or the claim) after it says whose source, for a reader going button to button.
          aria-describedby={topic ? topicId : claimId}
          onClick={() => setOpen((value) => !value)}
          className={cn(buttonClass, "print:hidden")}
          data-testid="button-toggle-source"
        >
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "h-5 w-5 shrink-0 transition-transform motion-reduce:transition-none text-muted-foreground",
              open && "rotate-180 text-primary",
            )}
          />
          {open ? words.hide(excerpts.length) : words.show(excerpts.length)}
        </button>
        <ReadAloudButton
          pieces={topic ? [topic, resolved.claim.text] : [resolved.claim.text]}
          describedBy={topic ? topicId : claimId}
        />
        <p
          className="inline-flex items-center gap-2 text-base font-medium text-muted-foreground ml-auto bg-muted/30 px-3 py-1.5 rounded-lg border border-border/50"
          data-testid="text-location-summary"
        >
          <FileText aria-hidden="true" className="h-5 w-5 shrink-0" />
          <span>
            {formatLocation(primary.location)}
            {others > 0 && ` ${words.moreLocations(others)}`}
          </span>
        </p>
      </div>

      {/*
        Collapsed with the `hidden` utility rather than the hidden attribute:
        preflight's [hidden] rule is !important inside the base layer, which
        nothing later can override, and a printed page must always carry its
        sources (print:block).
      */}
      <div
        id={panelId}
        data-testid="panel-source"
        className={cn(
          "space-y-6 border-l-[6px] border-primary/30 pl-5 md:pl-6 print:block rounded-r-2xl bg-muted/10 py-2",
          open ? "block mt-4" : "hidden",
        )}
      >
        <p className={topicClass}>{words.excerptLabel}</p>
        <ol className="space-y-6">
          {excerpts.map((chunk, index) => (
            <li key={chunk.id} className="space-y-3">
              <blockquote
                className="whitespace-pre-line font-serif text-lg leading-relaxed text-foreground md:text-xl relative"
                data-testid={`text-excerpt-${index}`}
              >
                <span className="text-primary/20 text-4xl font-serif absolute -left-5 -top-2 select-none" aria-hidden="true">"</span>
                {chunk.text}
              </blockquote>
              <p className="text-sm font-medium text-primary uppercase tracking-wide" data-testid={`text-location-${index}`}>
                {formatLocation(chunk.location)}
              </p>
            </li>
          ))}
        </ol>
        {unresolvedIds.length > 0 && (
          <p className="flex items-start gap-3 rounded-xl bg-muted/50 p-4 text-sm font-medium text-foreground/80 border border-border/50" data-testid="text-unresolved-note">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <span>{words.unresolved(unresolvedIds.length)}</span>
          </p>
        )}
      </div>
    </article>
  );
}

function UngroundedFallback({
  reason,
  topic,
  className,
}: {
  reason: UngroundedReason;
  topic?: string;
  className?: string;
}) {
  const titleId = useId();
  const words = copy.sourceCard.fallback;
  return (
    <article
      aria-labelledby={titleId}
      data-testid="source-card-fallback"
      data-reason={reason}
      className={cn(
        "min-w-0 flex flex-col gap-4 rounded-3xl border-2 border-dashed border-border/80 bg-muted/30 p-6 md:p-8",
        className,
      )}
    >
      {topic && (
        <p className={topicClass} data-testid="text-topic">
          {topic}
        </p>
      )}
      <div className="flex items-center gap-4">
         <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-card border border-border shadow-sm">
           <EyeOff aria-hidden="true" className="h-6 w-6 text-primary" />
         </div>
         <p id={titleId} className="text-xl font-semibold text-foreground min-w-0 [overflow-wrap:anywhere]">
           {words.title}
         </p>
      </div>
      <div className="space-y-2 pt-2">
         <p className="text-lg leading-relaxed text-foreground/80 font-medium" data-testid="text-fallback-reason">
           {words.reasons[reason]}
         </p>
         <p className="text-base leading-relaxed text-muted-foreground">{words.why}</p>
      </div>
    </article>
  );
}