import { copy } from "@/features/journey/copy";

/** First Tab stop on every page; jumps keyboard users past the header. */
export function SkipLink() {
  return (
    <a
      href="#main"
      data-testid="link-skip-to-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-50 px-4 py-2 bg-primary text-primary-foreground font-medium rounded-md focus:outline-none focus:ring-4 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
    >
      {copy.skipToContent}
    </a>
  );
}
