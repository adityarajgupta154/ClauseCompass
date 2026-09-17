import { useId } from "react";
import { CalendarClock, ClipboardList, IndianRupee, Scale, Type, type LucideIcon, ArrowRight } from "lucide-react";
import type { Change, ChangeKind, ChangeSide, DiffSegment } from "@workspace/api-client-react";
import { formatLocation } from "@/features/grounding/format-location";
import { copy } from "@/features/journey/copy";
import { cn } from "@/lib/utils";

/**
 * One difference between the two versions (FR-07): what kind of change it
 * is, both versions' paragraphs side by side with the changed words marked,
 * where each sits, the words that decided the kind, and the standard thing
 * to check for that kind. Icon, colour and word all carry the kind, so none
 * of them is the only place it is named; the marking of changed words is
 * doubled by `del`/`ins` semantics and a spoken prefix.
 */
const KINDS: Record<ChangeKind, { icon: LucideIcon; className: string }> = {
  money: { icon: IndianRupee, className: "border-family-money/30 bg-family-money/10 text-family-money" },
  time: { icon: CalendarClock, className: "border-family-time/30 bg-family-time/10 text-family-time" },
  duty: { icon: ClipboardList, className: "border-family-duty/30 bg-family-duty/10 text-family-duty" },
  remedy: { icon: Scale, className: "border-family-exit/30 bg-family-exit/10 text-family-exit" },
  wording: { icon: Type, className: "border-border bg-muted text-muted-foreground" },
};

export function kindLabel(kind: ChangeKind): string {
  return copy.compare.kinds[kind].label;
}

export function KindBadge({ kind, className }: { kind: ChangeKind; className?: string }) {
  const { icon: Icon, className: colours } = KINDS[kind];
  return (
    <span
      className={cn("inline-flex items-center gap-2 rounded-full border-2 px-3 py-1.5 text-sm font-bold uppercase tracking-widest", colours, className)}
      data-testid={`badge-kind-${kind}`}
    >
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span>
        <span className="sr-only">{copy.compare.card.kind} </span>
        {kindLabel(kind)}
      </span>
    </span>
  );
}

export function ChangeCard({ change }: { change: Change }) {
  const headingId = useId();
  const words = copy.compare;
  const otherSignals = change.signals.filter((signal) => signal !== change.kind);
  const hasTerms = change.values.older.length > 0 || change.values.newer.length > 0;

  return (
    <article
      aria-labelledby={headingId}
      data-testid={`card-change-${change.id}`}
      data-kind={change.kind}
      data-status={change.status}
      className="min-w-0 flex flex-col gap-6 rounded-3xl border border-border/80 bg-card p-6 md:p-8 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 pb-2 border-b border-border/50">
        <KindBadge kind={change.kind} />
        <h3 id={headingId} className="text-xl font-semibold text-foreground tracking-tight" data-testid="text-change-status">
          {words.statuses[change.status]}
        </h3>
      </div>

      <div className="grid gap-8 md:grid-cols-2 relative mt-2">
        <Excerpt side="older" excerpt={change.older} whole={change.status !== "changed"} />
        <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-12 w-12 items-center justify-center rounded-full bg-card border border-border/80 shadow-sm z-10 text-muted-foreground">
           <ArrowRight className="h-6 w-6 text-primary/40" aria-hidden="true" />
        </div>
        <Excerpt side="newer" excerpt={change.newer} whole={change.status !== "changed"} />
      </div>

      {hasTerms && (
        <div className="rounded-2xl bg-muted/30 p-5 mt-2 border border-border/50">
          <p className="text-base leading-relaxed text-foreground" data-testid="text-key-terms">
            <span className="font-semibold uppercase tracking-wide text-sm text-muted-foreground mr-2">{words.card.keyTerms}</span>
            {[
              change.values.older.length > 0 ? words.card.terms(words.card.older.toLowerCase(), change.values.older) : null,
              change.values.newer.length > 0 ? words.card.terms(words.card.newer.toLowerCase(), change.values.newer) : null,
            ]
              .filter((part): part is string => part !== null)
              .join("; ")}
          </p>
        </div>
      )}

      <div className="pt-4 mt-2 border-t border-border/50">
        <p className="text-lg leading-relaxed text-muted-foreground" data-testid="text-what-to-check">
          {words.kinds[change.kind].check}
          {otherSignals.length > 0 && <> {words.card.alsoTouches(otherSignals.map(kindLabel))}</>}
        </p>
      </div>
    </article>
  );
}

/** Not a landmark: seven cards each with an "Older version" region would be seven same-named regions; the label reads as a caption instead. */
function Excerpt({ side, excerpt, whole }: { side: "older" | "newer"; excerpt: ChangeSide | null; whole: boolean }) {
  const words = copy.compare.card;
  return (
    <div className="min-w-0 space-y-4" data-testid={`excerpt-${side}`}>
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className={cn(
          "text-sm font-bold uppercase tracking-widest",
          side === "older" ? "text-muted-foreground" : "text-primary"
        )}>{words[side]}</span>
        {excerpt && (
          <span className="text-sm font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-md" data-testid={`text-location-${side}`}>
            {formatLocation(excerpt.location)}
          </span>
        )}
      </p>
      {excerpt ? (
        <blockquote
          className={cn(
            "rounded-2xl border p-5 text-lg leading-relaxed text-foreground [overflow-wrap:anywhere] min-h-[140px]",
            side === "older" ? "border-border/80 bg-muted/40" : "border-primary/20 bg-primary/[0.03]"
          )}
        >
          {excerpt.segments.map((segment, index) => (
            <Segment key={index} side={side} segment={segment} whole={whole} />
          ))}
        </blockquote>
      ) : (
        <div className="flex items-center justify-center rounded-2xl border-2 border-dashed border-border/80 bg-muted/20 p-6 min-h-[140px]">
           <p className="text-lg font-medium italic text-muted-foreground">
             {side === "older" ? words.notInOlder : words.notInNewer}
           </p>
        </div>
      )}
    </div>
  );
}

/**
 * A changed run is `del` in the older version and `ins` in the newer, each
 * with a spoken prefix; the colour and the strike-through or underline are
 * the visual half. A whole added or removed paragraph keeps the semantics
 * and the tint but not the line, which would make a long paragraph hard to
 * read. Unchanged text is plain.
 */
function Segment({ side, segment, whole }: { side: "older" | "newer"; segment: DiffSegment; whole: boolean }) {
  const words = copy.compare.card;
  if (!segment.changed) return <>{segment.text}</>;
  if (side === "older") {
    return (
      <del
        className={cn("rounded-sm bg-destructive/10 px-1 text-foreground/80 decoration-destructive/60 decoration-[3px]", whole && "no-underline")}
        data-testid="text-removed"
      >
        <span className="sr-only">{words.removedWord} </span>
        {segment.text}
      </del>
    );
  }
  return (
    <ins
      className={cn(
        "rounded-sm bg-family-money/10 px-1 font-semibold text-foreground decoration-family-money decoration-[3px] underline-offset-4",
        whole && "no-underline",
      )}
      data-testid="text-added"
    >
      <span className="sr-only">{words.addedWord} </span>
      {segment.text}
    </ins>
  );
}