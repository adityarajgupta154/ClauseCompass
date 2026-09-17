import { useId, type ReactElement } from "react";
import { copy } from "@/features/journey/copy";
import type { StageId } from "@/features/journey/stages";
import { BRASS } from "@/lib/artwork";
import { cn } from "@/lib/utils";

/*
 * The drawing on each card of the choice: a contract with a pen laid on it,
 * a notice with a mark against it, an old and a new version side by side.
 * Decorative (the card's words carry the meaning), drawn in theme colours
 * so the same lines read on the light and the dark card. The short labels
 * on the documents come from copy so they change language with the rest.
 */

function Sheet({
  x,
  y,
  width,
  height,
  angle,
  label,
  lines,
  changed = [],
  signature = false,
  faint = false,
  shadow,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  label?: string;
  /** Each line's length as a share of the sheet's inner width. */
  lines: number[];
  /** The lines drawn in the accent colour, for changed passages. */
  changed?: number[];
  /** A signature line at the foot of the sheet. */
  signature?: boolean;
  faint?: boolean;
  /** The id of the blur filter under the sheet. */
  shadow: string;
}) {
  const centreX = x + width / 2;
  const centreY = y + height / 2;
  const firstLine = y + (label ? 42 : 22);
  return (
    <g transform={`rotate(${angle} ${centreX} ${centreY})`}>
      <rect x={x + 3} y={y + 6} width={width} height={height} rx="5" className="fill-black/[0.14]" filter={`url(#${shadow})`} />
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx="5"
        className={cn("fill-card", faint ? "stroke-foreground/35" : "stroke-foreground/65")}
        strokeWidth="1.5"
      />
      {label && (
        <>
          <text
            x={centreX}
            y={y + 20}
            textAnchor="middle"
            className="fill-foreground/80 font-sans text-[10px] font-semibold uppercase tracking-[0.18em]"
          >
            {label}
          </text>
          <line x1={x + 16} x2={x + width - 16} y1={y + 27} y2={y + 27} className="stroke-foreground/30" strokeWidth="1" strokeLinecap="round" />
        </>
      )}
      {lines.map((share, index) => (
        <line
          key={index}
          x1={x + 13}
          x2={x + 13 + (width - 26) * share}
          y1={firstLine + index * 12}
          y2={firstLine + index * 12}
          className={changed.includes(index) ? "stroke-primary/70" : "stroke-foreground/25"}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      ))}
      {signature && (
        <>
          <path
            d={`M${x + 16} ${y + height - 17}c5-9 9-3 13-7s5 2 9-4 6 6 12 1`}
            fill="none"
            className="stroke-foreground/60"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <line x1={x + 13} x2={x + width / 2 + 6} y1={y + height - 12} y2={y + height - 12} className="stroke-foreground/40" strokeWidth="1" strokeLinecap="round" />
        </>
      )}
    </g>
  );
}

/** A fountain pen with its nib at the origin, pointing left; the barrel runs to the right. */
function Pen({ shadow }: { shadow: string }) {
  return (
    <>
      <ellipse cx="78" cy="13" rx="62" ry="4" className="fill-black/20" filter={`url(#${shadow})`} />
      <rect x="22" y="-7" width="112" height="14" rx="7" className="fill-foreground/90" />
      <line x1="34" x2="122" y1="-3.5" y2="-3.5" className="stroke-card/30" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="72" y="-7.5" width="6" height="15" rx="1.5" fill={BRASS} />
      <rect x="128" y="-7.5" width="7" height="15" rx="2.5" fill={BRASS} />
      <path d="M0 0 24-5.5 24 5.5Z" fill={BRASS} />
      <line x1="5" x2="16" y1="0" y2="0" className="stroke-foreground/50" strokeWidth="0.8" />
    </>
  );
}

const SCENES: Record<StageId, (shadow: string) => ReactElement> = {
  "before-signing": (shadow) => (
    <>
      <circle cx="168" cy="96" r="70" className="fill-secondary" />
      <Sheet x={60} y={14} width={104} height={134} angle={-10} lines={[0.9, 0.7, 0.85, 0.6]} faint shadow={shadow} />
      <Sheet
        x={86}
        y={18}
        width={108}
        height={138}
        angle={-3}
        label={copy.welcome.stageArt.contract}
        lines={[0.9, 0.75, 0.85, 0.6, 0.8, 0.5]}
        signature
        shadow={shadow}
      />
      {/* The nib on the page, the barrel running down to the right. */}
      <g transform="translate(168 104) rotate(26)">
        <Pen shadow={shadow} />
      </g>
    </>
  ),
  "problem-started": (shadow) => (
    <>
      <circle cx="176" cy="94" r="70" className="fill-secondary" />
      <Sheet x={98} y={14} width={104} height={136} angle={7} lines={[0.85, 0.7, 0.9, 0.55]} faint shadow={shadow} />
      <Sheet
        x={116}
        y={18}
        width={108}
        height={138}
        angle={2}
        label={copy.welcome.stageArt.notice}
        lines={[0.85, 0.7, 0.9, 0.55, 0.8, 0.65]}
        shadow={shadow}
      />
      {/* The mark against it. */}
      <circle cx="222" cy="138" r="21" className="fill-card stroke-primary" strokeWidth="2.5" />
      <line x1="222" x2="222" y1="126" y2="141" className="stroke-primary" strokeWidth="3" strokeLinecap="round" />
      <circle cx="222" cy="148.5" r="2.2" className="fill-primary" />
    </>
  ),
  "compare-versions": (shadow) => (
    <>
      <circle cx="160" cy="88" r="74" className="fill-secondary" />
      <Sheet x={54} y={26} width={90} height={114} angle={-7} label={copy.welcome.stageArt.old} lines={[0.85, 0.65, 0.8, 0.5, 0.7]} shadow={shadow} />
      <Sheet
        x={168}
        y={24}
        width={90}
        height={114}
        angle={6}
        label={copy.welcome.stageArt.new}
        lines={[0.85, 0.7, 0.6, 0.8, 0.7]}
        changed={[1, 3]}
        shadow={shadow}
      />
      {/* From the one to the other. */}
      <path
        d="M104 152C130 172 190 172 214 150M204 148l11 2-3 11"
        fill="none"
        className="stroke-primary"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
};

export function StageArt({ stage, className }: { stage: StageId; className?: string }) {
  // One filter per drawing: three of them share the page, and a filter's id must be its own.
  const shadow = useId();
  return (
    <svg aria-hidden="true" viewBox="0 0 300 170" className={cn("block h-auto w-full overflow-visible", className)}>
      <defs>
        <filter id={shadow} x="-20%" y="-20%" width="140%" height="150%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      {SCENES[stage](shadow)}
    </svg>
  );
}
