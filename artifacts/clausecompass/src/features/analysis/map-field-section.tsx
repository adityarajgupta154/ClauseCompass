import { useId } from "react";
import { FileQuestion, Quote } from "lucide-react";
import type { MapField } from "@workspace/api-client-react";
import type { ChunkIndex } from "@/features/grounding/resolve-claim";
import { SourceCard } from "@/features/grounding/source-card";
import { copy } from "@/features/journey/copy";

export function topicLabel(category: string): string | undefined {
  return copy.map.topics[category];
}

/**
 * One point of the Document Map (FR-04) in one of its three states. "Not
 * found" is a deliberate, visible card rather than an omitted section, so a
 * reader can see which points the document is silent on. "Wording-only" is
 * the document's own sentences with the reason no rephrasing is shown; it is
 * never dressed up as "not found".
 */
export function MapFieldSection({ field, chunks }: { field: MapField; chunks: ChunkIndex }) {
  const headingId = useId();
  const words = copy.map.fields[field.id];

  return (
    <section aria-labelledby={headingId} className="space-y-6" data-testid={`section-map-${field.id}`} data-status={field.status}>
      <div className="space-y-2">
        <h2 id={headingId} className="font-serif text-3xl md:text-4xl font-medium tracking-tight text-foreground">
          {words.title}
        </h2>
        <p className="max-w-prose text-xl leading-relaxed text-muted-foreground">{words.description}</p>
      </div>

      {field.status === "not-found" ? (
        <NotFoundCard missing={words.missing} />
      ) : (
        <div className="space-y-6">
          {field.status === "wording-only" && field.reason && <WordingOnlyNotice reason={field.reason} />}
          {field.claims.map((claim, index) => (
            <SourceCard
              key={`${claim.source_chunk_ids.join("+")}-${index}`}
              claim={claim}
              chunks={chunks}
              topic={topicLabel(claim.category)}
              className="border-2 border-border/60 hover:border-primary/40 bg-card"
            />
          ))}
          {field.withheld > 0 && (
            <p className="text-lg font-medium leading-relaxed text-foreground/80 mt-4 bg-muted/40 p-4 rounded-xl border border-border/80" data-testid={`text-withheld-${field.id}`}>
              {copy.map.withheld(field.withheld)}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export function NotFoundCard({ missing, title = copy.map.notFound.title }: { missing?: string; title?: string }) {
  const titleId = useId();
  return (
    <article
      aria-labelledby={titleId}
      data-testid="card-not-found"
      className="flex items-start gap-5 rounded-3xl border-2 border-dashed border-border/80 bg-muted/20 p-8 shadow-sm"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-card border border-border/80 shrink-0 shadow-sm">
         <FileQuestion aria-hidden="true" className="h-7 w-7 text-muted-foreground" />
      </div>
      <div className="space-y-2 mt-1">
         <p id={titleId} className="text-2xl font-serif font-medium text-foreground tracking-tight min-w-0 [overflow-wrap:anywhere]">
           {title}
         </p>
         {missing && (
           <p className="text-lg leading-relaxed text-muted-foreground max-w-prose" data-testid="text-not-found-body">
             {copy.map.notFound.body(missing)}
           </p>
         )}
      </div>
    </article>
  );
}

function WordingOnlyNotice({ reason }: { reason: NonNullable<MapField["reason"]> }) {
  const words = copy.map.wordingOnly;
  return (
    <p
      className="flex items-start gap-4 rounded-3xl border-2 border-primary/20 bg-primary/[0.03] p-6 shadow-sm"
      data-testid="text-wording-only"
      data-reason={reason}
    >
      <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Quote className="h-6 w-6 text-primary" />
      </span>
      <span className="mt-2.5 text-lg leading-relaxed text-foreground/90">
        <span className="mr-2 font-semibold text-primary">{words.title}.</span> {words.reasons[reason]}
      </span>
    </p>
  );
}