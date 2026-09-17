import { CalendarClock, ClipboardList, DoorOpen, IndianRupee, ShieldCheck, type LucideIcon } from "lucide-react";
import type { RuleFamilyId } from "@workspace/api-client-react";
import { copy } from "@/features/journey/copy";
import { cn } from "@/lib/utils";

/**
 * Icon, colour and text for each clause-rule family. All three carry the
 * same meaning, so a reader who cannot see colour, or icons, still has the
 * word; the badge is never the only place a family is named.
 */
const FAMILIES: Record<RuleFamilyId, { icon: LucideIcon; className: string }> = {
  money: { icon: IndianRupee, className: "border-family-money/30 bg-family-money/10 text-family-money" },
  time: { icon: CalendarClock, className: "border-family-time/30 bg-family-time/10 text-family-time" },
  duty: { icon: ClipboardList, className: "border-family-duty/30 bg-family-duty/10 text-family-duty" },
  exit: { icon: DoorOpen, className: "border-family-exit/30 bg-family-exit/10 text-family-exit" },
  "data-ip": { icon: ShieldCheck, className: "border-family-data-ip/30 bg-family-data-ip/10 text-family-data-ip" },
};

export function familyLabel(family: RuleFamilyId): string {
  return copy.review.family[family];
}

export function FamilyBadge({ family, className }: { family: RuleFamilyId; className?: string }) {
  const { icon: Icon, className: colours } = FAMILIES[family];
  return (
    <span
      className={cn("inline-flex items-center gap-2 rounded-full border-2 px-3 py-1.5 text-sm font-bold uppercase tracking-widest", colours, className)}
      data-testid={`badge-family-${family}`}
    >
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span>
        <span className="sr-only">{copy.review.card.topic} </span>
        {familyLabel(family)}
      </span>
    </span>
  );
}