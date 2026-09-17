import { isHeading } from "@workspace/grounding";

/**
 * Reading the reference a paragraph carries at its start ("4.2", "A.",
 * "Schedule I"). A heuristic over the paragraph split the extraction layer
 * produces; it only shapes how a hit is named. The heading test the engine
 * skips paragraphs with is the retriever's too, so it lives in grounding and
 * is re-exported here.
 */
export { isHeading };

export type ClauseLabel =
  { kind: "clause"; label: string } | { kind: "recital"; label: string } | { kind: "schedule"; label: string };

const NUMBERED = /^(\d+(?:\.\d+)+)\b/;
const SECTION = /^(\d+)\.\s+\S/;
const RECITAL = /^([A-Z])\.\s+\S/;
const SCHEDULE = /^((?:schedule|annexure|appendix|exhibit)\s+(?:[IVX]+|[A-Z]|\d+))\b/i;

export function detectClauseLabel(text: string): ClauseLabel | null {
  const trimmed = text.trimStart();
  const schedule = SCHEDULE.exec(trimmed);
  if (schedule) return { kind: "schedule", label: schedule[1]!.replace(/\s+/g, " ") };
  const numbered = NUMBERED.exec(trimmed);
  if (numbered) return { kind: "clause", label: numbered[1]! };
  const section = SECTION.exec(trimmed);
  if (section) return { kind: "clause", label: section[1]! };
  const recital = RECITAL.exec(trimmed);
  if (recital) return { kind: "recital", label: recital[1]! };
  return null;
}

/** How a hit refers to its paragraph inside a review prompt. */
export function describeClause(label: ClauseLabel | null): string {
  if (!label) return "this clause";
  switch (label.kind) {
    case "clause":
      return `clause ${label.label}`;
    case "recital":
      return `recital ${label.label}`;
    case "schedule":
      return label.label;
  }
}
