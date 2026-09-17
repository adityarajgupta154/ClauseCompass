import books from "@/assets/stage-books.webp";
import leaf from "@/assets/stage-leaf.webp";
import paper from "@/assets/stage-paper.webp";
import { MarginAside } from "@/components/margin-aside";
import { copy } from "@/features/journey/copy";
import { INK } from "@/lib/artwork";

/*
 * What sits either side of the choice on a wide screen: a handwritten line
 * and a stack of books on the left, three faint words and a sheet with a
 * typed line on the right, a leaf or two out of focus at the page's edges.
 * Decorative; the choice reads the same without them. The pictures are
 * cutouts anchored to the cards' side and allowed to run off the page's edge
 * (the band clips them) and a little under the cards, rather than shrink.
 * The words on the books' spines are part of the photograph, like the words
 * on the banner's props; the lines set in type come from copy.
 */

const LEAF_SIZE = { width: 480, height: 471 };

export function StageShelf() {
  return (
    <MarginAside side="left" beside="72rem" from="10rem">
      {/* The shadow of a leaf, high up. */}
      <img
        src={leaf}
        alt=""
        {...LEAF_SIZE}
        loading="lazy"
        decoding="async"
        className="absolute -left-10 top-4 w-[11rem] -rotate-[55deg] opacity-[0.12] blur-[3px] grayscale"
      />
      <p className="absolute left-[10%] top-[16rem] w-[64%] -rotate-[9deg] text-balance text-center font-hand text-[max(15cqw,12px)] font-semibold leading-[1.12] text-foreground/75">
        {copy.welcome.hero.notes.second}
      </p>
      <img
        src={books}
        alt=""
        width={720}
        height={418}
        loading="lazy"
        decoding="async"
        className="absolute -right-12 bottom-[4.25rem] block h-auto w-[17rem] max-w-[calc(100%+6rem)] drop-shadow-[0_18px_24px_rgba(31,42,58,0.22)]"
      />
    </MarginAside>
  );
}

export function StageDesk() {
  return (
    <MarginAside side="right" beside="72rem" from="10rem">
      <p className="absolute right-[8%] top-[4rem] w-[92%] -rotate-[10deg] text-right font-serif text-[max(8cqw,12px)] font-medium uppercase leading-[1.75] tracking-[0.2em] text-foreground/45">
        {copy.welcome.stageAside.words.map((word) => (
          <span key={word} className="block">
            {word}
          </span>
        ))}
        <span className="ml-auto mt-[0.45em] block h-[1.5px] w-[72%] bg-foreground/45"></span>
      </p>
      {/* A plant at the page's edge, out of focus. */}
      <img
        src={leaf}
        alt=""
        {...LEAF_SIZE}
        loading="lazy"
        decoding="async"
        className="absolute -right-16 top-[33%] w-[16rem] max-w-none rotate-[15deg] opacity-90 blur-[2.5px] brightness-90 saturate-[0.85]"
      />
      <div className="@container absolute -bottom-6 -left-10 w-[19rem] max-w-[calc(100%+8rem)]">
        <img
          src={paper}
          alt=""
          width={640}
          height={746}
          loading="lazy"
          decoding="async"
          className="block h-auto w-full drop-shadow-[0_18px_24px_rgba(31,42,58,0.16)]"
        />
        {/* Typed on the sheet, so in ink whatever the colour scheme. */}
        <p
          style={{ color: INK }}
          className="absolute left-[14%] top-[20%] w-[54%] -rotate-[17deg] text-center font-serif text-[max(4.6cqw,10px)] font-medium uppercase leading-[1.5] tracking-[0.12em]"
        >
          {copy.welcome.stageAside.paper}
        </p>
      </div>
    </MarginAside>
  );
}
