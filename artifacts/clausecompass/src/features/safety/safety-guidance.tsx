import { Siren } from "lucide-react";
import type { SafetyEscalation } from "@workspace/rules";
import { copy } from "@/features/journey/copy";
import { CallButtons, GuidanceCards, resourcesForGuidance } from "@/features/resources/resource-cards";

/**
 * The body of the safety screen (PRD §8, the escalation branch), from the
 * flow's escalation alone: the emergency panel led by the primary cue's
 * route, why the screen is showing, then the full card of every route the
 * cues named. Pure: no router, no session, no model. The numbers come from
 * the resource registry through the guidance keys; the copy names no number
 * itself, and nothing the reader typed is shown back (the flow dropped the
 * matched words when it escalated).
 */
export function SafetyGuidance({ safety }: { safety: SafetyEscalation }) {
  const words = copy.safety;
  const category = words.categories[safety.category];
  const routes = resourcesForGuidance(safety.guidance);
  const lead = routes[0];

  return (
    <div className="space-y-16">
      <section
        aria-labelledby="emergency-heading"
        data-testid="section-emergency"
        className="space-y-8 rounded-3xl border-2 border-primary/40 bg-primary/5 p-8 md:p-12 shadow-sm"
      >
        <div className="flex flex-col md:flex-row md:items-start gap-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shrink-0 shadow-md">
             <Siren aria-hidden="true" className="h-8 w-8" />
          </div>
          <div className="space-y-4">
             <h2 id="emergency-heading" className="font-serif text-3xl md:text-5xl font-medium leading-tight text-foreground tracking-tight">
               {category.heading}
             </h2>
             <p className="max-w-3xl text-xl leading-relaxed text-foreground/90 font-medium" data-testid="text-emergency-lead">
               {category.body}
             </p>
          </div>
        </div>
        {lead !== undefined && (
          <div className="md:ml-[88px] pt-4">
             <CallButtons resource={lead} />
          </div>
        )}
      </section>

      <section aria-labelledby="why-heading" className="space-y-4 max-w-3xl" data-testid="section-why">
        <h2 id="why-heading" className="font-serif text-3xl font-medium text-foreground tracking-tight">
          {words.why.heading}
        </h2>
        <div className="space-y-3 pt-2">
           <p className="text-xl leading-relaxed text-foreground/80" data-testid="text-why">
             {words.why.body}
           </p>
           <p className="text-lg leading-relaxed text-muted-foreground">{words.why.mismatch}</p>
        </div>
      </section>

      <section aria-labelledby="routes-heading" className="space-y-8" data-testid="section-routes">
        <div className="space-y-3">
           <h2 id="routes-heading" className="font-serif text-3xl font-medium text-foreground tracking-tight">
             {words.routes.heading}
           </h2>
           <p className="text-lg text-muted-foreground">{copy.resources.linksNote}</p>
        </div>
        <GuidanceCards keys={safety.guidance} />
      </section>
    </div>
  );
}