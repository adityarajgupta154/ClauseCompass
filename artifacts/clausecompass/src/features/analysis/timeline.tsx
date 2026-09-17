import { useId } from "react";
import { AlertTriangle, CalendarDays } from "lucide-react";
import type { TimelineItem } from "@workspace/api-client-react";
import type { ChunkIndex } from "@/features/grounding/resolve-claim";
import { SourceCard } from "@/features/grounding/source-card";
import { copy } from "@/features/journey/copy";
import { NotFoundCard } from "./map-field-section";
import { describeAmbiguity, formatIsoDate, groupTimeline } from "./timeline-groups";

/**
 * The date timeline (FR-05): every explicit date, in order, each as a
 * SourceCard of the sentence it sits in. A date the document writes in a way
 * that can be read two ways carries an explicit uncertainty label with the
 * other reading; nothing is silently picked.
 */
export function Timeline({ items, chunks }: { items: TimelineItem[]; chunks: ChunkIndex }) {
  const headingId = useId();
  const words = copy.timeline;
  const groups = groupTimeline(items);

  return (
    <section aria-labelledby={headingId} className="mt-16 space-y-8 border-t border-border/80 pt-16" data-testid="section-timeline">
      <div className="max-w-3xl space-y-3">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-family-time/30 bg-family-time/10">
            <CalendarDays className="h-7 w-7 text-family-time" aria-hidden="true" />
          </span>
          <h2 id={headingId} className="font-serif text-3xl font-medium tracking-tight text-foreground md:text-4xl">
            {words.heading}
          </h2>
        </div>
        <p className="max-w-prose text-lg leading-relaxed text-muted-foreground">{words.lead}</p>
      </div>

      {groups.length === 0 ? (
        <NotFoundCard title={words.empty.title} />
      ) : (
        // The rail down the left joins the date markers; each date is one list item so the order is in the markup too.
        <ol className="relative space-y-12 before:absolute before:inset-y-2 before:left-[19px] before:w-0.5 before:bg-border">
          {groups.map((group) => (
            <li key={group.date} className="relative space-y-6 pl-14" data-testid={`timeline-date-${group.date}`}>
              <h3 className="flex min-h-10 items-center gap-3 text-xl font-semibold text-foreground md:text-2xl">
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full border-4 border-background bg-family-time text-background shadow-sm"
                >
                  <CalendarDays className="h-4 w-4" />
                </span>
                <time dateTime={group.date}>{formatIsoDate(group.date)}</time>
              </h3>
              <ul className="space-y-6">
                {group.items.map((item, index) => (
                  <TimelineEntry key={`${item.claim.source_chunk_ids.join("+")}-${index}`} item={item} chunks={chunks} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function TimelineEntry({ item, chunks }: { item: TimelineItem; chunks: ChunkIndex }) {
  const words = copy.timeline;
  const ambiguity = describeAmbiguity(item);
  const topics = item.topics.slice(0, 2);

  return (
    <li className="space-y-4" data-testid="timeline-item" data-ambiguity={item.ambiguity?.kinds.join(" ") ?? "none"}>
      {ambiguity && (
        <p
          className="flex items-start gap-4 rounded-2xl border border-family-exit/30 bg-family-exit/5 p-5 text-base leading-relaxed text-foreground"
          data-testid="text-date-ambiguity"
        >
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-family-exit/10">
            <AlertTriangle className="h-5 w-5 text-family-exit" />
          </span>
          <span className="pt-1.5">
            <span className="font-semibold">{words.ambiguityLabel}.</span> {words.asWritten(item.asWritten)}. {ambiguity}
          </span>
        </p>
      )}
      <SourceCard
        claim={item.claim}
        chunks={chunks}
        topic={topics.length > 0 ? topics.join(copy.sourceCard.location.separator) : copy.map.topics.date}
      />
    </li>
  );
}
