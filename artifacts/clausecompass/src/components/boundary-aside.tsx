import { ShieldCheck } from "lucide-react";
import papers from "@/assets/boundary-papers.webp";
import { MarginAside } from "@/components/margin-aside";
import { copy } from "@/features/journey/copy";
import { INK } from "@/lib/artwork";

/*
 * The two pictures that flank the boundary statement on a wide screen: the
 * same papers with a handwritten line on the left, a small note pointing at
 * the statement on the right. Both are decorative and say nothing the
 * statement itself does not. The words are sized in container units, like
 * the rest of the decoration: the text-size control does not apply to it.
 */

export function BoundaryPapers() {
  return (
    <MarginAside side="left" beside="53rem" from="13rem">
      {/* Anchored to the card's side and allowed to run off the page's left edge (the band clips it) rather than shrink. */}
      <div className="@container absolute right-0 top-10 w-[23rem] max-w-[calc(100%+5rem)]">
        <img
          src={papers}
          alt=""
          width={640}
          height={781}
          loading="lazy"
          decoding="async"
          className="block h-auto w-full drop-shadow-[0_18px_24px_rgba(31,42,58,0.16)]"
        />
        {/* Written in ink whatever the colour scheme: the paper stays light. */}
        <p
          style={{ color: INK }}
          className="absolute left-[34%] top-[20%] w-[38%] -rotate-[9deg] text-balance font-hand text-[max(7.5cqw,12px)] font-semibold leading-[1.1]"
        >
          {copy.boundary.notes.papers}
        </p>
      </div>
    </MarginAside>
  );
}

export function BoundaryNote() {
  return (
    <MarginAside side="right" beside="53rem" from="13rem">
      <div className="@container absolute left-0 top-8 w-[14rem] max-w-full">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-primary">
          <ShieldCheck className="h-7 w-7" strokeWidth={1.75} />
        </span>
        <p className="ml-[8%] mt-[1.4em] w-[86%] -rotate-[8deg] text-balance font-hand text-[max(9.5cqw,12px)] font-semibold leading-[1.15] text-primary">
          {copy.boundary.notes.aside}
        </p>
        {/* A short curve back towards the statement. */}
        <svg viewBox="0 0 48 30" className="mt-[0.5em] h-auto w-[26%] overflow-visible text-primary">
          <path
            d="M46 4C40 20 26 27 4 25M12 18l-8 7 9 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </MarginAside>
  );
}
