import leaf from "@/assets/stage-leaf.webp";
import papers from "@/assets/upload-papers.webp";
import { MarginAside } from "@/components/margin-aside";
import { copy } from "@/features/journey/copy";
import { INK } from "@/lib/artwork";

/*
 * What sits in the page margins of the upload screen on a wide screen: a
 * handwritten line either side of the heading, and beside the document card
 * and the notice a plant on the left and a stack of paper with a fountain pen
 * on the right. Decorative; the screen reads the same without them. The
 * handwritten and typed lines come from copy, so they follow the language;
 * their size is in container units, like the rest of the decoration, so the
 * text-size control does not apply to them.
 */

/** A short stroke under a handwritten line, drawn in the primary colour. */
function Underline({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 12" className={className}>
      <path
        d="M3 8C30 3 70 2 117 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function UploadNotes() {
  return (
    <>
      <MarginAside side="left" beside="53rem" from="10rem">
        <div className="@container absolute right-[24%] top-[30%] w-[8rem] max-w-[80%]">
          <p className="-rotate-[12deg] text-balance text-center font-hand text-[max(19cqw,12px)] font-semibold leading-[1.15] text-foreground/80">
            {copy.upload.aside.left}
          </p>
          <Underline className="ml-[16%] mt-[0.2em] h-auto w-[68%] -rotate-[12deg] overflow-visible text-primary" />
        </div>
      </MarginAside>
      <MarginAside side="right" beside="53rem" from="10rem">
        <div className="@container absolute left-[24%] top-[34%] w-[8rem] max-w-[80%]">
          <p className="-rotate-[10deg] text-balance text-center font-hand text-[max(19cqw,12px)] font-semibold leading-[1.15] text-foreground/80">
            {copy.upload.aside.right}
          </p>
          <Underline className="ml-[16%] mt-[0.2em] h-auto w-[68%] -rotate-[10deg] overflow-visible text-primary" />
        </div>
      </MarginAside>
    </>
  );
}

export function UploadPlant() {
  return (
    <MarginAside side="left" beside="66rem" from="13rem">
      {/* Anchored low on the left, a little out of focus, allowed to run off the page's edge and under the card. */}
      <img
        src={leaf}
        alt=""
        width={480}
        height={471}
        loading="lazy"
        decoding="async"
        className="absolute -left-20 bottom-[-4rem] w-[24rem] max-w-none -rotate-[20deg] opacity-90 blur-[1.5px] brightness-95 saturate-[0.85]"
      />
    </MarginAside>
  );
}

export function UploadPapers() {
  return (
    <MarginAside side="right" beside="66rem" from="13rem">
      <div className="@container absolute -right-6 bottom-[-3rem] w-[17rem] max-w-[calc(100%+1.5rem)] rotate-[24deg]">
        <img
          src={papers}
          alt=""
          width={640}
          height={774}
          loading="lazy"
          decoding="async"
          className="block h-auto w-full drop-shadow-[0_18px_24px_rgba(31,42,58,0.18)]"
        />
        {/* Typed on the top sheet, so in ink whatever the colour scheme. */}
        <p
          style={{ color: INK }}
          className="absolute left-[30%] top-[16%] w-[58%] text-center font-serif text-[max(5.2cqw,10px)] font-medium uppercase leading-[1.5] tracking-[0.12em]"
        >
          {copy.upload.aside.paper}
        </p>
      </div>
    </MarginAside>
  );
}
