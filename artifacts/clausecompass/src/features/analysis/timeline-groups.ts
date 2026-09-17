import type { TimelineItem } from "@workspace/api-client-react";
import { copy } from "@/features/journey/copy";

/** "24 February 2026" from "2026-02-24"; the date is a calendar day, so it is formatted in UTC on purpose. */
export function formatIsoDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat(copy.timeline.locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export interface TimelineGroup {
  date: string;
  items: TimelineItem[];
}

/** Consecutive items on the same calendar day share one heading. The API sorts items by date, then position. */
export function groupTimeline(items: readonly TimelineItem[]): TimelineGroup[] {
  const groups: TimelineGroup[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && last.date === item.date) last.items.push(item);
    else groups.push({ date: item.date, items: [item] });
  }
  return groups;
}

/** One sentence per reason the date is uncertain, in the API's order; null when it is certain. */
export function describeAmbiguity(item: TimelineItem): string | null {
  const ambiguity = item.ambiguity;
  if (!ambiguity || ambiguity.kinds.length === 0) return null;
  const sentences = ambiguity.kinds.map((kind) =>
    kind === "day-month-order"
      ? copy.timeline.ambiguity["day-month-order"](
          ambiguity.alternative ? formatIsoDate(ambiguity.alternative) : "another date",
        )
      : copy.timeline.ambiguity["two-digit-year"],
  );
  return `${sentences.join(" ")} ${copy.timeline.ambiguityCheck}`;
}
