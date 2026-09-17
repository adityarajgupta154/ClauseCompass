import { CalendarCheck, ExternalLink, Info, MessageSquareText, Phone } from "lucide-react";
import { resourceForGuidance, resourcesFor, type ConcernId, type Contact, type Resource } from "@workspace/resources";
import type { GuidanceKey } from "@workspace/rules";
import { copy } from "@/features/journey/copy";
import { focusRing } from "@/lib/focus-ring";

/**
 * The resource cards of the official-help screen (FR-10). The list takes a
 * concern, not entries: it resolves the registry itself, so the only text and
 * links that can ever reach a card are the reviewed ones in `data/resources`.
 * A caller with model output has no way to hand it in. Each card carries the
 * two lines the PRD requires on it: the day the entry was last checked and
 * the reminder to confirm availability and eligibility with the service.
 *
 * External links open in a new tab on purpose: the journey's session lives
 * in this tab's memory, and a same-tab visit to a government site would end
 * it. The screen says so once, above the list; each link also says it to a
 * screen reader.
 */
export function ResourceCards({ concern }: { concern: ConcernId }) {
  return (
    <ul className="space-y-6" data-testid="list-resources">
      {resourcesFor(concern).map((resource) => (
        <li key={resource.id}>
          <ResourceCard resource={resource} />
        </li>
      ))}
    </ul>
  );
}

/**
 * The services behind the decision flow's guidance keys (PRD §8), in the
 * flow's order: the primary cue's route first. Two keys that name the same
 * service (the police and the emergency number are both 112) give one entry.
 * Resolved here, from keys, for the same reason as above: nothing but the
 * registry can put a number on the safety screen.
 */
export function resourcesForGuidance(keys: readonly GuidanceKey[]): Resource[] {
  const seen = new Set<string>();
  const resources: Resource[] = [];
  for (const key of keys) {
    const resource = resourceForGuidance(key);
    if (seen.has(resource.id)) continue;
    seen.add(resource.id);
    resources.push(resource);
  }
  return resources;
}

export function GuidanceCards({ keys }: { keys: readonly GuidanceKey[] }) {
  return (
    <ul className="space-y-6" data-testid="list-guidance-resources">
      {resourcesForGuidance(keys).map((resource) => (
        <li key={resource.id}>
          <ResourceCard resource={resource} />
        </li>
      ))}
    </ul>
  );
}

/**
 * One large "Call 112"-style control per phone number of a service, for the
 * emergency panel of the safety screen: the number is the whole button, in
 * the biggest type on the page, with the registry's label for it beside.
 */
export function CallButtons({ resource }: { resource: Resource }) {
  const phones = resource.contacts.filter((contact) => contact.kind === "phone");
  return (
    <ul className="flex flex-col gap-5" aria-label={resource.name}>
      {phones.map((contact) => {
        const digits = dialDigits(contact.number);
        return (
          <li key={contact.number} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
            <a
              href={`tel:${digits}`}
              data-testid={`link-call-${digits}`}
              className={`inline-flex min-h-[72px] items-center justify-center gap-4 whitespace-nowrap rounded-2xl bg-card border-4 border-primary px-8 text-2xl font-bold tabular-nums text-primary shadow-sm transition-colors hover:bg-primary hover:text-primary-foreground hover:shadow-md md:px-10 md:text-4xl ${focusRing}`}
            >
              <Phone aria-hidden="true" className="hidden h-8 w-8 shrink-0 sm:block" />
              {copy.safety.call(contact.number)}
            </a>
            <span className="text-lg leading-snug text-foreground md:text-xl font-medium">
              {contact.label}
              {contact.note !== undefined && <span className="text-muted-foreground block text-base font-normal mt-1">{contact.note}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const externalLinkClass = `inline-flex items-center gap-1.5 rounded-md font-semibold text-primary underline decoration-primary/30 decoration-2 underline-offset-4 hover:decoration-primary hover:bg-primary/5 px-1 -mx-1 transition-colors ${focusRing}`;
const subheadingClass = "text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2 block";

function ResourceCard({ resource }: { resource: Resource }) {
  const nameId = `resource-${resource.id}-name`;
  const words = copy.resources.card;
  return (
    <article
      aria-labelledby={nameId}
      data-testid={`card-resource-${resource.id}`}
      className="flex flex-col gap-6 rounded-3xl border border-border/80 bg-card p-6 md:p-8 shadow-sm transition-shadow hover:shadow-md"
    >
      <header className="space-y-3 pb-4 border-b border-border/50">
        <h3 id={nameId} className="font-serif text-2xl md:text-3xl font-medium leading-tight text-foreground tracking-tight">
          {resource.name}
        </h3>
        <p className="text-base text-muted-foreground">
          <span className="font-semibold uppercase tracking-widest text-sm text-foreground/80 mr-2">{words.runBy}:</span> {resource.runBy}
        </p>
      </header>

      <p className="text-lg leading-relaxed text-foreground md:text-xl">{resource.summary}</p>

      {resource.whoItIsFor !== undefined && (
        <div className="bg-muted/20 p-5 rounded-2xl border border-border/50">
          <h4 className={subheadingClass}>{words.whoItIsFor}</h4>
          <p className="text-lg leading-relaxed text-foreground/90">{resource.whoItIsFor}</p>
        </div>
      )}

      <div className="space-y-4">
        <h4 className={subheadingClass}>{words.howToReach}</h4>
        <ul className="space-y-4">
          {resource.contacts.map((contact, index) => (
            <li key={index} className="flex items-start gap-4 text-lg leading-relaxed">
              <ContactLine contact={contact} />
            </li>
          ))}
        </ul>
        {resource.hours !== undefined && (
          <p className="text-base text-foreground/90 pt-2">
            <span className="font-semibold uppercase tracking-widest text-sm text-muted-foreground mr-2 block mb-1">{words.hours}:</span> {resource.hours}
          </p>
        )}
      </div>

      <footer className="space-y-4 border-t border-border/80 pt-6 mt-2">
        <p className="flex items-start gap-3 text-base font-semibold text-foreground bg-primary/[0.03] border border-primary/20 p-4 rounded-xl" data-testid="text-confirm-with-service">
          <Info aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <span className="leading-snug">{words.confirm}</span>
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-medium text-muted-foreground" data-testid="text-last-checked">
          <CalendarCheck aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>{words.lastChecked(formatCheckedDate(resource.lastChecked))}</span>
          <span aria-hidden="true" className="text-border">|</span>
          <span>
            {words.source}{" "}
            <a href={resource.sourceUrl} target="_blank" rel="noopener noreferrer" className={`${externalLinkClass} text-sm ml-1`}>
              {hostOf(resource.sourceUrl)}
              <span className="sr-only"> ({words.opensInNewTab})</span>
            </a>
          </span>
        </p>
      </footer>
    </article>
  );
}

function ContactLine({ contact }: { contact: Contact }) {
  const words = copy.resources.card;
  switch (contact.kind) {
    case "phone":
      return (
        <>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5">
             <Phone aria-hidden="true" className="h-5 w-5 text-primary" />
          </div>
          <div className="flex flex-col">
             <span className="font-medium text-foreground">{contact.label}</span>
             <span className="mt-1">
               <a href={`tel:${dialDigits(contact.number)}`} className={`${externalLinkClass} text-xl tabular-nums`}>
                 {contact.number}
               </a>
             </span>
             {contact.note !== undefined && <span className="text-base text-muted-foreground mt-1">{contact.note}</span>}
          </div>
        </>
      );
    case "message":
      return (
        <>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5">
             <MessageSquareText aria-hidden="true" className="h-5 w-5 text-primary" />
          </div>
          <div className="flex flex-col">
             <span className="font-medium text-foreground">{contact.label}</span>
             <span className="mt-1">
               <a href={`sms:${dialDigits(contact.number)}`} className={`${externalLinkClass} text-xl tabular-nums`}>
                 {contact.number}
               </a>
             </span>
             {contact.note !== undefined && <span className="text-base text-muted-foreground mt-1">{contact.note}</span>}
          </div>
        </>
      );
    case "web":
      return (
        <>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5">
             <ExternalLink aria-hidden="true" className="h-5 w-5 text-primary" />
          </div>
          <div className="flex flex-col">
             <span className="mt-1">
               <a href={contact.url} target="_blank" rel="noopener noreferrer" className={externalLinkClass}>
                 {contact.label}
                 <span className="sr-only"> ({words.opensInNewTab})</span>
               </a>
             </span>
             {contact.note !== undefined && <span className="text-base text-muted-foreground mt-1">{contact.note}</span>}
          </div>
        </>
      );
  }
}

/** "1800-11-4000" → "18001140000"-style digits for a tel: or sms: link. */
function dialDigits(number: string): string {
  return number.replace(/\D/g, "");
}

function hostOf(url: string): string {
  return url.replace(/^https:\/\//, "").replace(/[/?#].*$/, "");
}

/** The registry's YYYY-MM-DD as "15 September 2026", read as a calendar day (no timezone shift). */
export function formatCheckedDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
}