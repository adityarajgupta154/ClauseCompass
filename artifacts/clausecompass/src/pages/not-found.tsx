import { Link } from "wouter";
import { FileQuestion, ArrowLeft } from "lucide-react";
import { SkipLink } from "@/components/skip-link";
import { copy } from "@/features/journey/copy";
import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  const words = copy.notFoundPage;
  return (
    <div className="flex min-h-[100dvh] flex-col font-sans bg-background">
      <SkipLink />
      <SiteHeader />

      <main id="main" className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center p-6 text-center space-y-10">
        <div className="flex h-32 w-32 items-center justify-center rounded-[32px] bg-card border border-border/80 shadow-sm">
          <FileQuestion className="h-16 w-16 text-primary" aria-hidden="true" />
        </div>
        
        <div className="space-y-4">
          <h1 className="text-4xl md:text-5xl font-serif font-medium text-foreground tracking-tight">
            {words.heading}
          </h1>
          <p className="text-xl text-muted-foreground leading-relaxed max-w-md mx-auto">
            {words.body}
          </p>
        </div>
        
        <Link
          href="/"
          data-testid="link-return-home"
          className="inline-flex min-h-[56px] items-center justify-center gap-3 rounded-2xl bg-primary px-8 text-lg font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ArrowLeft className="h-6 w-6" aria-hidden="true" />
          {words.returnHome}
        </Link>
      </main>
    </div>
  );
}