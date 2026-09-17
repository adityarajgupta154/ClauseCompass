import { useId, useState } from "react";
import { ChevronDown, ClipboardCheck, FileText } from "lucide-react";
import type { GroundedClaim, ReviewPrompt } from "@workspace/api-client-react";
import { formatLocation } from "@/features/grounding/format-location";
import { resolveClaim, type ChunkIndex } from "@/features/grounding/resolve-claim";
import { SourceCard } from "@/features/grounding/source-card";
import { copy } from "@/features/journey/copy";
import { cn } from "@/lib/utils";
import { FamilyBadge } from "./family-badge";
import { focusRing } from "@/lib/focus-ring";

/** Places shown before the reader has to ask for the rest. */
export const PLACES_SHOWN = 2;

const toggleClass =
  `inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-xl px-4 py-2 text-left text-base font-semibold text-foreground transition-colors [overflow-wrap:anywhere] hover:bg-muted border border-transparent hover:border-border/80 shadow-sm ${focusRing}`;

/**
 * One review prompt (FR-06): the rule's name and why it matters, the
 * question to ask — as a source card, so its wording is one click away and
 * an unverifiable prompt is visibly withheld — and every place in the
 * document the rule fired on. A template prompt says so, with the reason,
 * rather than passing for one written for this document.
 */
export function ReviewPromptCard({ prompt, chunks }: { prompt: ReviewPrompt; chunks: ChunkIndex }) {
  const headingId = useId();
  const template = prompt.phrasedBy === "template" ? prompt.reason : null;
  return (
    <article
      aria-labelledby={headingId}
      data-testid={`card-review-prompt-${prompt.ruleId}`}
      data-rule={prompt.ruleId}
      data-relevance={prompt.relevance}
      data-phrased-by={prompt.phrasedBy}
      className="min-w-0 space-y-6 rounded-3xl border border-border/80 bg-card p-6 md:p-8 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="space-y-4">
        <FamilyBadge family={prompt.family} />
        {/* The rule's name and reason come from the registry, which is written in English whatever the screen shows. */}
        <h3 id={headingId} lang="en" className="font-serif text-2xl md:text-3xl font-medium tracking-tight text-foreground">
          {prompt.title}
        </h3>
        <p lang="en" className="max-w-prose text-lg leading-relaxed text-muted-foreground" data-testid="text-why-it-matters">
          {prompt.whyItMatters}
        </p>
      </div>

      {template && <TemplateNotice reason={template} />}

      <div className="mt-4">
        <SourceCard claim={prompt.prompt} chunks={chunks} className="border-[3px] border-primary/20 bg-primary/[0.02]" />
      </div>

      <div className="pt-6 border-t border-border/60">
        <Places places={prompt.places} chunks={chunks} />
      </div>
    </article>
  );
}

function TemplateNotice({ reason }: { reason: NonNullable<ReviewPrompt["reason"]> }) {
  const words = copy.review.card.template;
  return (
    <p
      className="flex items-start gap-4 rounded-2xl border border-primary/20 bg-primary/[0.03] p-5 shadow-sm"
      data-testid="text-template-prompt"
      data-reason={reason}
    >
      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <ClipboardCheck className="h-5 w-5 text-primary" />
      </span>
      <span className="mt-1 text-lg leading-relaxed text-foreground/90">
        <span className="mr-2 font-semibold text-primary">{words.title}.</span> {words.reasons[reason]}
      </span>
    </p>
  );
}

/**
 * The paragraphs the rule fired on, in document order, each with its
 * clause label and the triggering sentence. The first two are open; the
 * rest sit behind one button, so a rule that fires throughout an NDA does
 * not push the next prompt off the screen.
 */
function Places({ places, chunks }: { places: GroundedClaim[]; chunks: ChunkIndex }) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const words = copy.review.card;
  const hidden = places.length - PLACES_SHOWN;
  const shown = expanded ? places : places.slice(0, PLACES_SHOWN);
  return (
    <div className="space-y-5" data-testid="list-places">
      <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
        <FileText aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span data-testid="text-places-count">{words.places(places.length)}</span>
      </p>
      <ol id={id} className="space-y-6">
        {shown.map((place, index) => (
          <Place key={`${place.source_chunk_ids.join("+")}-${index}`} place={place} chunks={chunks} index={index} />
        ))}
      </ol>
      {hidden > 0 && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((value) => !value)}
          className={cn(toggleClass, "print:hidden")}
          data-testid="button-toggle-places"
        >
          <ChevronDown aria-hidden="true" className={cn("h-5 w-5 shrink-0 transition-transform motion-reduce:transition-none text-muted-foreground", expanded && "rotate-180 text-foreground")} />
          {expanded ? words.showFewerPlaces : words.showMorePlaces(hidden)}
        </button>
      )}
    </div>
  );
}

function Place({ place, chunks, index }: { place: GroundedClaim; chunks: ChunkIndex; index: number }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const words = copy.review.card;
  const resolved = resolveClaim(place, chunks);
  // A place is the document's own sentence; one that cannot be traced to a paragraph is not shown at all.
  if (resolved.status === "ungrounded") return null;
  const chunk = resolved.excerpts[0];
  // Most paragraphs are one sentence; the paragraph is offered only when it says more than the sentence shown.
  const hasMore = chunk.text.trim() !== resolved.claim.text.trim();
  return (
    <li className="space-y-3 border-l-[4px] border-border/80 pl-5 relative before:absolute before:left-[-4px] before:top-0 before:h-full before:w-[4px] hover:before:bg-primary/20 transition-colors" data-testid={`place-${index}`}>
      <p className="inline-flex text-sm font-bold uppercase tracking-widest text-muted-foreground bg-muted/40 px-2.5 py-1 rounded-md border border-border/50" data-testid={`text-place-location-${index}`}>
        {formatLocation(resolved.claim.location ?? chunk.location)}
      </p>
      <blockquote className="font-serif text-lg leading-relaxed text-foreground md:text-xl relative pt-1" data-testid={`text-place-sentence-${index}`}>
        <span className="text-primary/10 text-4xl font-serif absolute -left-4 -top-2 select-none" aria-hidden="true">"</span>
        {resolved.claim.text}
      </blockquote>
      {hasMore && (
        <div className="pt-2">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((value) => !value)}
            className={cn(toggleClass, "text-sm print:hidden")}
            data-testid={`button-toggle-paragraph-${index}`}
          >
            <ChevronDown aria-hidden="true" className={cn("h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none text-muted-foreground", open && "rotate-180 text-foreground")} />
            {open ? words.hideParagraph : words.showParagraph}
          </button>
          {/* The `hidden` utility, not the attribute: preflight's [hidden] is !important and print:block could not undo it. */}
          <blockquote
            id={panelId}
            className={cn("whitespace-pre-line rounded-2xl bg-muted/30 border border-border/60 p-5 mt-3 font-serif text-base leading-relaxed text-foreground print:block", open ? "block" : "hidden")}
            data-testid={`text-place-paragraph-${index}`}
          >
            {chunk.text}
          </blockquote>
        </div>
      )}
    </li>
  );
}