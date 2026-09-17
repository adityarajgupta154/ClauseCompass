import cards from "@/assets/footer-cards.webp";
import olive from "@/assets/footer-olive.webp";
import { MarginAside } from "@/components/margin-aside";
import { copy } from "@/features/journey/copy";
import { INK } from "@/lib/artwork";

/*
 * What sits either side of the footer's official-help section on a wide
 * screen: an olive branch with a handwritten line beside it on the left; a
 * faint compass rose and a stack of note cards with a fountain pen, the top
 * card carrying a line of type, on the right. Decorative; the section reads
 * the same without them. The pictures are cutouts anchored to the margin's
 * outer edge and cut at the margin box's edges (each box clips itself, so
 * nothing lengthens the page or reaches the words); the box goes with the
 * margin, so the text-size control and narrow screens take everything away
 * together. The two lines of text come from copy, set over the pictures,
 * so they translate; the ink on the card is fixed because the card stays
 * cream paper in dark mode.
 */

export function FooterBranch() {
  return (
    <MarginAside side="left" beside="48rem" from="13rem" className="overflow-hidden">
      <img
        src={olive}
        alt=""
        width={720}
        height={516}
        loading="lazy"
        decoding="async"
        className="absolute -left-10 top-1/2 w-[14rem] max-w-none -translate-y-[68%] -rotate-[14deg] opacity-95 drop-shadow-[0_10px_14px_rgba(31,42,58,0.16)]"
      />
      {/* Offset from the band's middle in rem, like the branch, so the two keep their distance whatever the band's height. */}
      <p className="absolute left-[7rem] top-[calc(50%+2.75rem)] w-[5.75rem] -rotate-[9deg] font-hand text-[1.45rem] font-semibold leading-[1.15] text-foreground/70">
        {copy.footer.asideNote}
      </p>
    </MarginAside>
  );
}

export function FooterDesk() {
  return (
    <MarginAside side="right" beside="48rem" from="13rem" className="overflow-hidden">
      <CompassRose className="absolute -right-3 -top-4 h-[13rem] w-[13rem] text-foreground opacity-[0.11] dark:opacity-[0.14]" />
      {/* The stack's box is its own container, so the words on the card scale with the card, not with the margin. */}
      <div className="absolute -right-8 bottom-0 w-[15rem] max-w-[calc(100%+2rem)] @container">
        <img
          src={cards}
          alt=""
          width={720}
          height={791}
          loading="lazy"
          decoding="async"
          className="block h-auto w-full drop-shadow-[0_16px_22px_rgba(31,42,58,0.2)]"
        />
        <p
          style={{ color: INK }}
          className="absolute left-[17%] top-[27%] w-[48%] -rotate-[13deg] text-center font-serif text-[max(6.2cqw,8px)] font-medium uppercase leading-[1.55] tracking-[0.16em] opacity-80"
        >
          {copy.footer.cardNote}
        </p>
      </div>
    </MarginAside>
  );
}

/*
 * A compass rose drawn in the page's own ink: four long points and four
 * short ones, each split into a filled and an open half, inside a ring of
 * ticks, with the cardinal letters outside the ring. Geometry is worked out
 * once at module level; the letters are read from copy when it renders.
 */
const CENTRE = 120;
const point = (angle: number, radius: number) => {
  const a = ((angle - 90) * Math.PI) / 180;
  return [CENTRE + radius * Math.cos(a), CENTRE + radius * Math.sin(a)] as const;
};
const xy = ([x, y]: readonly [number, number]) => `${x.toFixed(1)} ${y.toFixed(1)}`;

/** The two halves of one point of the star: [filled half, open half]. */
function starPoint(angle: number, length: number, shoulder: number) {
  const tip = point(angle, length);
  const left = point(angle - 90, shoulder);
  const right = point(angle + 90, shoulder);
  const centre = point(angle, 0);
  return [`M${xy(tip)} L${xy(left)} L${xy(centre)} Z`, `M${xy(tip)} L${xy(right)} L${xy(centre)} Z`] as const;
}

const LONG_POINTS = [0, 90, 180, 270].map((angle) => starPoint(angle, 92, 11));
const SHORT_POINTS = [45, 135, 225, 315].map((angle) => starPoint(angle, 58, 9));
const TICKS = Array.from({ length: 72 }, (_, index) => {
  const angle = index * 5;
  const major = angle % 45 === 0;
  return `M${xy(point(angle, major ? 96 : 100))} L${xy(point(angle, 104))}`;
}).join(" ");
/** Where the cardinal letters go, clockwise from the top; the letters themselves come from copy at render time. */
const LETTER_ANGLES = [0, 90, 180, 270] as const;

function CompassRose({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 240" className={className} fill="none" stroke="currentColor" aria-hidden="true">
      <circle cx={CENTRE} cy={CENTRE} r="104" strokeWidth="1" />
      <circle cx={CENTRE} cy={CENTRE} r="66" strokeWidth="0.75" strokeDasharray="1.5 5" />
      <path d={TICKS} strokeWidth="1" />
      {SHORT_POINTS.map(([filled, open]) => (
        <g key={filled}>
          <path d={filled} fill="currentColor" stroke="none" opacity="0.7" />
          <path d={open} strokeWidth="1" />
        </g>
      ))}
      {LONG_POINTS.map(([filled, open]) => (
        <g key={filled}>
          <path d={filled} fill="currentColor" stroke="none" />
          <path d={open} strokeWidth="1" />
        </g>
      ))}
      <circle cx={CENTRE} cy={CENTRE} r="5" fill="currentColor" stroke="none" />
      {LETTER_ANGLES.map((angle, index) => {
        const [x, y] = point(angle, 117);
        return (
          <text
            key={angle}
            x={x}
            y={y}
            fill="currentColor"
            stroke="none"
            fontSize="17"
            textAnchor="middle"
            dominantBaseline="central"
            className="font-serif"
          >
            {copy.footer.compassPoints[index]}
          </text>
        );
      })}
    </svg>
  );
}
