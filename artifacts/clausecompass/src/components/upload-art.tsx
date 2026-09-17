import folder from "@/assets/upload-folder.webp";
import { copy } from "@/features/journey/copy";
import { INK } from "@/lib/artwork";
import { cn } from "@/lib/utils";

/*
 * The picture beside the file input on a wide screen: a folder with its
 * papers fanned out, the word on the front sheet and a handwritten line with
 * an arrow pointing at it. Decorative; the input beside it carries the
 * meaning. The word is set over the photograph from copy, in ink because the
 * sheet stays light in either colour scheme; the note sits on the tile's own
 * tint, so it takes the theme's colours. Sizes are in container units so the
 * words keep their place on the picture at any width. The scene keeps a
 * fixed proportion and sits in the middle of the tile, so when two inputs
 * make the tile tall (comparing versions) the picture does not stretch; the
 * note then speaks of both versions.
 */
export function DocumentArt({ compare, className }: { compare: boolean; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none flex select-none items-center overflow-hidden rounded-xl bg-secondary/50 print:hidden",
        className,
      )}
    >
      <div className="@container relative aspect-[4/3] w-full">
        {/* A soft disc behind the papers. */}
        <span className="absolute right-[6%] top-[8%] aspect-square w-[62%] rounded-full bg-secondary"></span>
        <img
          src={folder}
          alt=""
          width={760}
          height={613}
          loading="lazy"
          decoding="async"
          className="absolute left-[5%] top-[6%] block h-auto w-[74%] drop-shadow-[0_18px_24px_rgba(31,42,58,0.2)]"
        />
        {/* The word on the front sheet. */}
        <p
          style={{ color: INK }}
          className="absolute left-[44%] top-[23%] w-[26%] -rotate-[4deg] text-center font-serif text-[max(3.4cqw,10px)] font-medium uppercase tracking-[0.14em]"
        >
          {copy.upload.art.label}
        </p>
        {/* The handwritten line, with a short curve towards the sheet. */}
        <div className="absolute bottom-[4%] right-[3%] w-[24%]">
          <p className="-rotate-[8deg] text-balance text-center font-hand text-[max(4.6cqw,12px)] font-semibold leading-[1.1] text-foreground/80">
            {compare ? copy.upload.art.noteCompare : copy.upload.art.note}
          </p>
          <svg viewBox="0 0 48 30" className="ml-[10%] mt-[0.3em] h-auto w-[34%] overflow-visible text-primary">
            <path
              d="M44 26C34 12 22 6 4 8M12 3l-8 5 6 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
