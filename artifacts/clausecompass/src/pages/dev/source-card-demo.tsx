import { useMemo } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SkipLink } from "@/components/skip-link";
import { MOCK_CASES, MOCK_CHUNKS } from "@/features/grounding/mock-claims";
import { indexChunks } from "@/features/grounding/resolve-claim";
import { SourceCard } from "@/features/grounding/source-card";

/**
 * Development-only gallery of SourceCard states on hardcoded data. Mounted
 * from App.tsx behind import.meta.env.DEV; not part of the product journey.
 */
export default function SourceCardDemo() {
  const chunks = useMemo(() => indexChunks(MOCK_CHUNKS), []);

  return (
    <div className="flex min-h-[100dvh] flex-col font-sans selection:bg-primary/20 selection:text-foreground">
      <SkipLink />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 space-y-12 px-6 py-10 pb-20 md:py-16">
        <div className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Dev only</p>
          <h1 className="font-serif text-4xl font-medium tracking-tight text-foreground [overflow-wrap:anywhere] md:text-5xl">
            SourceCard states
          </h1>
          <p className="max-w-prose text-lg leading-relaxed text-muted-foreground">
            Hardcoded claims over verbatim paragraphs of the synthetic offer letter. The last four cases
            show what a reader sees when a claim cannot be traced to the document.
          </p>
        </div>

        {MOCK_CASES.map((demo) => (
          <section key={demo.id} aria-labelledby={`case-${demo.id}`} className="space-y-4" data-testid={`case-${demo.id}`}>
            <h2 id={`case-${demo.id}`} className="font-serif text-2xl font-medium text-foreground [overflow-wrap:anywhere]">
              {demo.label}
            </h2>
            <SourceCard claim={demo.claim} chunks={chunks} topic={demo.topic} defaultOpen={demo.defaultOpen} />
            <details className="text-sm text-muted-foreground">
              <summary className="min-h-[44px] cursor-pointer list-item rounded-md px-1 py-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                Input claim object
              </summary>
              <pre className="mt-2 overflow-x-auto rounded-xl bg-muted p-4 text-xs leading-relaxed text-foreground/80">
                {JSON.stringify(demo.claim, null, 2)}
              </pre>
            </details>
          </section>
        ))}
      </main>
      <SiteFooter />
    </div>
  );
}
