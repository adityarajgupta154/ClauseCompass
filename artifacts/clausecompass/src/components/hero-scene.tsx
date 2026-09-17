import { ArrowRight } from "lucide-react";
import heroArt480 from "@/assets/hero-art-480.webp";
import heroArt640 from "@/assets/hero-art-640.webp";
import heroArt800 from "@/assets/hero-art-800.webp";
import heroArt1024 from "@/assets/hero-art-1024.webp";
import { BrandMark, Wordmark } from "@/components/brand-mark";
import { copy } from "@/features/journey/copy";
import { INK, TERRACOTTA } from "@/lib/artwork";
import { cn } from "@/lib/utils";

/*
 * The welcome banner's picture: an agreement standing in a leather folder with
 * one paragraph outlined, a compass, a pen, three books. Over the photograph
 * sit a small ClauseCompass card (what the product hands back for a clause),
 * a route from the outlined paragraph to the card, and two handwritten notes.
 * The whole thing is decorative (aria-hidden): the heading, tagline and
 * introduction beside it say everything it shows.
 *
 * The box keeps a fixed 6:5 shape and shows the lower 6:5 of the square
 * photograph (the pen lies along the bottom edge; only wall and leaves are
 * left out at the top), so every overlay position below (percentages of the
 * box) lands on the same part of the scene at any width. Overlay text is sized in
 * container units for the same reason; the text-size control does not apply
 * to decoration. The notes and the route are written in fixed ink and
 * terracotta (lib/artwork) rather than theme tokens: they sit on the
 * photograph, which is the same light paper in both colour schemes.
 */

export function HeroScene({ className }: { className?: string }) {
  const words = copy.welcome.hero;
  return (
    <div
      aria-hidden="true"
      className={cn("@container pointer-events-none relative aspect-[6/5] min-w-0 select-none overflow-hidden rounded-3xl lg:rounded-none", className)}
    >
      {/* Four WebP sizes of the photograph's lower 6:5 (the part the box shows; cut and scaled from src/assets/hero-art.jpg, the square original the social card also uses); the sizes attribute mirrors the layout, full width less the margins on a phone, the wider column from lg. */}
      <img
        src={heroArt1024}
        srcSet={`${heroArt480} 480w, ${heroArt640} 640w, ${heroArt800} 800w, ${heroArt1024} 1024w`}
        sizes="(min-width: 64rem) min(55vw, 60.5rem), calc(100vw - 3rem)"
        alt=""
        width={1024}
        height={853}
        fetchPriority="high"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover object-bottom lg:hero-photo"
      />

      {/* The route from the outlined paragraph to the card; the dashes travel along it. */}
      <svg viewBox="0 0 120 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <marker id="hero-route-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0 10 5 0 10Z" fill={TERRACOTTA} />
          </marker>
        </defs>
        <path
          d="M81 27C93 36 91 52 65 58"
          fill="none"
          stroke={TERRACOTTA}
          vectorEffect="non-scaling-stroke"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="5 6"
          markerEnd="url(#hero-route-head)"
          className="animate-dash"
        />
      </svg>

      {/* What the product hands back: the name, then the meaning of the clause in plain words (drawn as lines here). */}
      <div
        className="absolute left-[16%] top-[48%] w-[36%] rounded-[0.8em] border border-border/70 bg-card/95 p-[1em] pl-[1.2em] text-[max(1.8cqw,9px)] shadow-xl animate-float motion-reduce:animate-none"
        style={{ animationDelay: "-2s" }}
      >
        <span className="absolute bottom-[0.9em] left-0 top-[0.9em] w-[0.28em] rounded-r-full bg-primary"></span>
        <div className="flex items-center gap-[0.5em]">
          <BrandMark className="h-[1.5em] w-[1.5em]" />
          <Wordmark className="font-serif text-[1.1em] font-bold text-primary [&>span]:text-primary" />
        </div>
        <p className="mt-[0.75em] text-[1.05em] font-semibold leading-snug text-foreground">{words.cardLead}</p>
        <div className="mt-[0.65em] space-y-[0.5em]">
          <span className="block h-[0.45em] w-[92%] rounded-full bg-foreground/15"></span>
          <span className="block h-[0.45em] w-[72%] rounded-full bg-foreground/15"></span>
          <span className="block h-[0.45em] w-[46%] rounded-full bg-foreground/15"></span>
        </div>
        <span className="absolute bottom-[0.9em] right-[0.9em] flex h-[1.9em] w-[1.9em] items-center justify-center rounded-full bg-primary text-primary-foreground">
          <ArrowRight className="h-[1em] w-[1em]" />
        </span>
      </div>

      {/* Two notes in a hand, the way a reader annotates the margin. Both sit inside the photograph's unfaded area (the left 16% and top 12% dissolve into the page from lg, and ink on a dark page would not read). */}
      <p
        style={{ color: INK }}
        className="absolute left-[17%] top-[14%] w-[14%] -rotate-[8deg] font-hand text-[max(2.1cqw,12px)] font-semibold leading-[1.15] animate-in fade-in slide-in-from-left-4 duration-1000 delay-500 fill-mode-both motion-reduce:animate-none"
      >
        {words.notes.first}
        <svg viewBox="0 0 40 24" className="ml-[45%] mt-[0.2em] h-[1.2em] w-[2em] overflow-visible">
          <path d="M2 2C10 4 20 10 34 20M28 20l6 0 0-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </p>
      <p
        style={{ color: INK }}
        className="absolute right-[2%] top-[19%] w-[20%] -rotate-[8deg] font-hand text-[max(2.1cqw,12px)] font-semibold leading-[1.15] animate-in fade-in slide-in-from-right-4 duration-1000 delay-700 fill-mode-both motion-reduce:animate-none"
      >
        {words.notes.second}
        <svg viewBox="0 0 40 24" className="ml-[10%] mt-[0.2em] h-[1.2em] w-[2em] overflow-visible">
          <path d="M38 2C30 4 20 10 6 20M12 20l-6 0 0-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </p>
    </div>
  );
}
