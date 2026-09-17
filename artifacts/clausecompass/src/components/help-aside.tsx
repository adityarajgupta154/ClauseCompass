import books from "@/assets/help-books.webp";
import leaf from "@/assets/stage-leaf.webp";
import scale from "@/assets/help-scale.webp";
import { MarginAside } from "@/components/margin-aside";
import { copy } from "@/features/journey/copy";

/*
 * What sits either side of the way to official help on a wide screen: a
 * stack of books with a plant behind them on the left, a balance on a block
 * of stone with a handwritten line beside it on the right. Decorative; the
 * card reads the same without them. The pictures are cutouts anchored to
 * the card's side and allowed to run off the page's edge (the band clips
 * them sideways) rather than shrink. The words on the books' spines are part
 * of the photograph, like the words on the banner's props; the handwritten
 * line comes from copy.
 */

export function HelpShelf() {
  return (
    <MarginAside side="left" beside="66rem" from="13rem">
      {/* The plant behind the books, a little out of focus. */}
      <img
        src={leaf}
        alt=""
        width={480}
        height={471}
        loading="lazy"
        decoding="async"
        className="absolute -left-12 top-2 w-[14rem] max-w-none -rotate-[25deg] opacity-95 blur-[1.5px] brightness-95 saturate-[0.9]"
      />
      <img
        src={books}
        alt=""
        width={720}
        height={500}
        loading="lazy"
        decoding="async"
        className="absolute -left-6 bottom-0 block h-auto w-[16rem] max-w-[calc(100%+1.5rem)] drop-shadow-[0_18px_24px_rgba(31,42,58,0.22)]"
      />
    </MarginAside>
  );
}

export function HelpScales() {
  return (
    <MarginAside side="right" beside="66rem" from="13rem">
      {/* A soft disc behind the balance, running off the page's edge. */}
      <span className="absolute -right-24 top-[-2rem] h-[26rem] w-[26rem] rounded-full bg-secondary/70"></span>
      <p className="absolute left-[2%] top-[38%] w-[40%] -rotate-[6deg] text-balance text-center font-hand text-[max(9.5cqw,12px)] font-semibold leading-[1.15] text-foreground/75">
        {copy.welcome.helpAside.note}
      </p>
      <img
        src={scale}
        alt=""
        width={570}
        height={640}
        loading="lazy"
        decoding="async"
        className="absolute -right-10 bottom-0 block h-auto w-[15rem] max-w-[calc(100%+2.5rem)] drop-shadow-[0_18px_24px_rgba(31,42,58,0.22)]"
      />
    </MarginAside>
  );
}
