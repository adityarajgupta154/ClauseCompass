import { ShieldCheck } from "lucide-react";
import { copy } from "@/features/journey/copy";

interface UploadRetentionNoticeProps {
  ttlMinutes: number | null;
}

export function UploadRetentionNotice({ ttlMinutes }: UploadRetentionNoticeProps) {
  return (
    <div className="relative mx-auto max-w-[66rem] px-6">
      <section
        aria-labelledby="retention-heading"
        data-testid="section-retention"
        className="space-y-6 rounded-2xl border border-border/70 bg-card p-7 shadow-sm md:p-9"
      >
        <div className="flex items-start gap-5 md:items-center">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
            <ShieldCheck aria-hidden="true" className="h-6 w-6" strokeWidth={1.75} />
          </div>
          <h2 id="retention-heading" className="font-serif text-2xl font-medium leading-snug tracking-tight text-foreground md:text-[1.75rem]">
            {copy.upload.notice.title}
          </h2>
        </div>
        <ul className="space-y-5 md:pl-[4.25rem]">
          {copy.upload.notice.points(ttlMinutes).map((point, index) => (
            <li
              key={index}
              className="flex gap-4 text-lg leading-relaxed text-foreground/80"
              data-testid={`text-retention-point-${index}`}
            >
              <span aria-hidden="true" className="mt-1 select-none text-xl font-bold text-primary/60">
                —
              </span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}