import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * The page margin beside a centred block, as a box for a decoration: the
 * full height of the block's band and as wide as the margin less the
 * gutter. The children show only once the box is wide enough, through a
 * container query on the box itself; the threshold is written in rem so
 * that the text-size control, which widens the block in rem and closes the
 * margin, also takes the decoration away when the room goes. Widths are a
 * percentage of the band rather than of the viewport, so the scrollbar never
 * counts as room. Everything inside is decorative and out of the tree.
 *
 * Tailwind reads complete class names from the source, so each width the
 * product uses is written out here rather than built from a number.
 */
const BESIDE = {
  "48rem": "w-[max(0px,calc((100%-48rem)/2-1.5rem))]",
  "53rem": "w-[max(0px,calc((100%-53rem)/2-1.5rem))]",
  "60rem": "w-[max(0px,calc((100%-60rem)/2-1.5rem))]",
  "66rem": "w-[max(0px,calc((100%-66rem)/2-1.5rem))]",
  "72rem": "w-[max(0px,calc((100%-72rem)/2-1.5rem))]",
} as const;

const FROM = {
  "10rem": "hidden @min-[10rem]:block",
  "13rem": "hidden @min-[13rem]:block",
} as const;

export function MarginAside({
  side,
  beside,
  from,
  className,
  children,
}: {
  side: "left" | "right";
  /** The centred block's maximum width, which fixes the margin. */
  beside: keyof typeof BESIDE;
  /** The narrowest margin the decoration still fits. */
  from: keyof typeof FROM;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-y-0 hidden select-none @container lg:block print:hidden",
        BESIDE[beside],
        side === "left" ? "left-0" : "right-0",
      )}
    >
      <div className={cn(FROM[from], "absolute inset-0", className)}>{children}</div>
    </div>
  );
}
