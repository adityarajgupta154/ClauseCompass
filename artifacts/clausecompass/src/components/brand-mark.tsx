import { copy } from "@/features/journey/copy";
import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
  /** Classes for the needle group, so a host can turn it (the header spins it once on hover). */
  needleClassName?: string;
}

/**
 * The ClauseCompass mark: a compass in a thin ring, needle set a little east
 * of north, the way the product points a reader from the wording to what it
 * means. Every colour is a theme token, so the same mark sits on paper and on
 * dark surfaces; public/favicon.svg is the same drawing with the light-theme
 * colours written in. Decorative wherever it appears: the product name is
 * always next to it as text.
 */
export function BrandMark({ className, needleClassName }: BrandMarkProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" className={cn("shrink-0", className)}>
      <circle cx="24" cy="24" r="21" className="fill-card stroke-primary" strokeWidth="2.5" />
      <circle cx="24" cy="24" r="16.5" fill="none" strokeWidth="1" strokeDasharray="1.2 3.05" className="stroke-primary/50" />
      {[0, 90, 180, 270].map((angle) => (
        <rect key={angle} x="23.25" y="5.5" width="1.5" height="4" rx="0.75" className="fill-primary" transform={`rotate(${angle} 24 24)`} />
      ))}
      <g className={cn("origin-center [transform-box:fill-box] rotate-[35deg]", needleClassName)}>
        <path d="M24 9.5 27.8 24H20.2Z" className="fill-primary" />
        <path d="M24 38.5 27.8 24H20.2Z" className="fill-foreground/35" />
      </g>
      <circle cx="24" cy="24" r="2.4" className="fill-card stroke-primary" strokeWidth="1.5" />
    </svg>
  );
}

/** The product name split where the second word begins, so the wordmark can colour the two halves. */
export function productNameParts(): [string, string] {
  const name = copy.product.name;
  const match = /^(\p{Lu}\p{Ll}+)(\p{Lu}.*)$/u.exec(name);
  return match ? [match[1], match[2]] : [name, ""];
}

/** The two-tone name, as text: the first word in ink, the second in the accent. */
export function Wordmark({ className }: { className?: string }) {
  const [head, tail] = productNameParts();
  return (
    <span className={className}>
      {head}
      {tail && <span className="text-primary">{tail}</span>}
    </span>
  );
}
