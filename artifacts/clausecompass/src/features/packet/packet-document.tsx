import type { ReactNode } from "react";
// The packet is prepared in English whatever language the screen shows (FR-09, FR-11), so it reads the English table, not the live `copy`.
import { en as copy } from "@/features/journey/copy";
import { cn } from "@/lib/utils";
import { type Packet, type PacketGroup, type PacketItem, type PacketSection } from "./build-packet";

/**
 * The packet as a printed sheet. Fixed light colours on white whatever the
 * app's theme, so the screen shows what the printer will produce and the
 * text survives a dark theme; no background fills carry meaning, since
 * printers drop them. Everything here comes from the packet model, so the
 * text export and this view can never say different things.
 */

const citationId = (number: number) => `packet-cite-${number}`;

/** Focus ring on the white sheet, where the app's theme colours do not apply. */
const paperFocus = "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white";

function References({ numbers, className }: { numbers: readonly number[]; className?: string }) {
  if (numbers.length === 0) return null;
  return (
    <span className={cn("text-sm text-neutral-600", className)}>
      {numbers.map((number, index) => (
        <span key={number}>
          {index > 0 && ", "}
          <a
            href={`#${citationId(number)}`}
            className={cn("whitespace-nowrap underline decoration-neutral-300 underline-offset-2 hover:text-neutral-900 print:no-underline", paperFocus)}
          >
            <span className="sr-only">{copy.packet.document.referencePrefix} </span>
            {copy.packet.document.reference(number)}
          </a>
        </span>
      ))}
    </span>
  );
}

function Topic({ children }: { children: ReactNode }) {
  return <span className="text-sm font-semibold uppercase tracking-wide text-neutral-600">{children}</span>;
}

function Item({ item }: { item: PacketItem }) {
  const words = copy.packet.document;
  switch (item.kind) {
    case "statement":
      return (
        <li className="space-y-1 break-inside-avoid" data-testid="packet-statement">
          {item.topic && (
            <p>
              <Topic>{item.topic}</Topic>
            </p>
          )}
          <p className="text-base leading-relaxed">
            {item.text} <References numbers={item.citations} />
          </p>
          {item.note && <p className="text-sm leading-relaxed text-neutral-700">{item.note}</p>}
        </li>
      );
    case "question":
      return (
        <li className="space-y-2 break-inside-avoid border-l-4 border-neutral-300 pl-4" data-testid="packet-question">
          <h4 className="font-serif text-xl font-medium tracking-tight">
            {item.title}{" "}
            <span className="ml-1 inline-block rounded-full border border-neutral-400 px-2 py-0.5 align-middle font-sans text-xs font-semibold uppercase tracking-wide text-neutral-700">
              {item.family}
            </span>
          </h4>
          <p className="text-sm leading-relaxed text-neutral-700">{item.why}</p>
          <p className={cn("font-serif text-lg leading-relaxed", item.withheld && "text-neutral-700")}>
            {item.question} {!item.withheld && <References numbers={item.citations} />}
          </p>
          {item.places.length > 0 && (
            <p className="text-sm text-neutral-700">
              {words.placesLabel} <References numbers={item.places} className="text-neutral-700" />.
            </p>
          )}
          {item.note && <p className="text-sm leading-relaxed text-neutral-700">{item.note}</p>}
        </li>
      );
    case "check":
      return (
        <li className="flex items-start gap-3 break-inside-avoid" data-testid="packet-check">
          <span aria-hidden="true" className="mt-1.5 h-4 w-4 shrink-0 rounded-[3px] border-2 border-neutral-800" />
          <span className="text-base leading-relaxed">
            {item.text} <References numbers={item.citations} />
          </span>
        </li>
      );
    case "citation":
      return (
        // Focusable so that following a reference moves the keyboard and reading position here, not only the scroll.
        <li
          id={citationId(item.number)}
          tabIndex={-1}
          className={cn("grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2 break-inside-avoid scroll-mt-6", paperFocus)}
          data-testid={`packet-citation-${item.number}`}
        >
          <span className="text-sm font-semibold text-neutral-700">{words.reference(item.number)}</span>
          <div className="space-y-1">
            <p className="text-sm text-neutral-600">{item.location}</p>
            <blockquote className="whitespace-pre-line font-serif text-base leading-relaxed">{item.text}</blockquote>
          </div>
        </li>
      );
    case "note":
      return (
        <li className="break-inside-avoid border-l-2 border-dashed border-neutral-400 pl-3 text-base leading-relaxed" data-testid="packet-note">
          {item.topic && (
            <>
              <Topic>{item.topic}</Topic>{" "}
            </>
          )}
          {item.text}
        </li>
      );
  }
}

function Group({ group, sectionId }: { group: PacketGroup; sectionId: string }) {
  const headingId = `packet-${sectionId}-${group.id}`;
  const list = group.items.some((item) => item.kind === "citation") ? "ol" : "ul";
  const List = list;
  return (
    <div className="space-y-3" data-testid={`packet-group-${group.id}`}>
      {group.heading && (
        <h3 id={headingId} className="break-after-avoid font-serif text-2xl font-medium tracking-tight">
          {group.heading}
        </h3>
      )}
      {group.note && <p className="text-sm leading-relaxed text-neutral-700">{group.note}</p>}
      <List aria-labelledby={group.heading ? headingId : undefined} className={cn("space-y-4", list === "ol" && "list-none")}>
        {group.items.map((item, index) => (
          <Item key={index} item={item} />
        ))}
      </List>
      {group.footnote && <p className="text-sm leading-relaxed text-neutral-700">{group.footnote}</p>}
    </div>
  );
}

function Section({ section }: { section: PacketSection }) {
  const headingId = `packet-${section.id}`;
  return (
    <section
      aria-labelledby={headingId}
      className={cn("mt-10 space-y-6", section.id === "citations" && "print:break-before-page")}
      data-testid={`packet-section-${section.id}`}
    >
      <div className="space-y-1 border-b border-neutral-300 pb-3">
        <h2 id={headingId} className="break-after-avoid font-serif text-3xl font-medium tracking-tight">
          {section.heading}
        </h2>
        <p className="text-sm leading-relaxed text-neutral-700">{section.lead}</p>
      </div>
      <div className="space-y-8">
        {section.groups.map((group) => (
          <Group key={group.id} group={group} sectionId={section.id} />
        ))}
      </div>
      {section.notes.map((note) => (
        <p key={note} className="text-sm leading-relaxed text-neutral-700">
          {note}
        </p>
      ))}
    </section>
  );
}

export function PacketDocument({ packet, className }: { packet: Packet; className?: string }) {
  return (
    <article
      aria-labelledby="packet-title"
      lang="en"
      className={cn(
        "mx-auto w-full max-w-3xl bg-white px-6 py-8 font-sans text-neutral-900 shadow-md ring-1 ring-neutral-200 md:px-12 md:py-12",
        "print:max-w-none print:p-0 print:shadow-none print:ring-0",
        className,
      )}
      data-testid="packet-document"
    >
      <header className="space-y-3 border-b-2 border-neutral-900 pb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-neutral-600">{packet.subtitle}</p>
        <h1 id="packet-title" className="font-serif text-4xl font-medium tracking-tight">
          {packet.title}
        </h1>
        <p className="text-base leading-relaxed" data-testid="text-packet-notice">
          {packet.notice}
        </p>
        <ul className="space-y-0.5 text-sm text-neutral-700" data-testid="text-packet-about">
          {packet.about.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </header>

      {packet.sections.map((section) => (
        <Section key={section.id} section={section} />
      ))}

      <footer className="mt-12 space-y-3 border-t-2 border-neutral-900 pt-6 break-inside-avoid" data-testid="text-packet-disclaimer">
        <h2 className="font-serif text-2xl font-medium tracking-tight">{packet.disclaimer.title}</h2>
        <ul className="list-disc space-y-2 pl-5 text-base leading-relaxed">
          {packet.disclaimer.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <p className="text-base leading-relaxed">{packet.disclaimer.closing}</p>
      </footer>
    </article>
  );
}
