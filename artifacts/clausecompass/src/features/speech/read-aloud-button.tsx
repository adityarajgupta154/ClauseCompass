import { useEffect, useId, useSyncExternalStore } from "react";
import { Square, Volume2 } from "lucide-react";
import { copy } from "@/features/journey/copy";
import { focusRing } from "@/lib/focus-ring";
import { cn } from "@/lib/utils";
import { getReadingState, isSpeechSupported, startReading, stopReading, stopReadingIf, subscribeReading, type ReadingState } from "./read-aloud";

const serverState: ReadingState = { activeId: null, failedId: null };

function getServerSnapshot(): ReadingState {
  return serverState;
}

/** Whether the reading under `id` is in progress, and whether it was the one that failed to start; re-renders when that changes. */
export function useReading(id: string): { reading: boolean; failed: boolean } {
  const state = useSyncExternalStore(subscribeReading, getReadingState, getServerSnapshot);
  return { reading: state.activeId === id, failed: state.failedId === id };
}

const buttonClass =
  `inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-xl border-2 border-border bg-background px-4 text-left text-base font-medium text-foreground transition-colors [overflow-wrap:anywhere] hover:border-primary/60 print:hidden ${focusRing}`;

export type ReadAloudButtonProps = {
  /** What to read, in order; blank pieces are skipped. */
  pieces: readonly string[];
  /** The button's name while idle; defaults to "Read aloud". */
  label?: string;
  /** Element ids that say what will be read (a claim, a heading), for a reader going button to button. */
  describedBy?: string;
  className?: string;
  testId?: string;
};

/**
 * A toggle that reads `pieces` with the browser's own speech (FR-11), or
 * stops the reading it started. Renders nothing where the browser has no
 * speech synthesis, rather than a button that does nothing. Leaving the
 * screen stops its reading.
 */
export function ReadAloudButton({ pieces, label, describedBy, className, testId = "button-read-aloud" }: ReadAloudButtonProps) {
  const id = useId();
  const { reading, failed } = useReading(id);
  const supported = isSpeechSupported();
  useEffect(() => () => stopReadingIf(id), [id]);
  if (!supported) return null;
  const words = copy.readAloud;
  return (
    <>
      <button
        type="button"
        // The name carries the state ("Read aloud" / "Stop reading"); no aria-pressed, which would double it.
        aria-describedby={describedBy}
        onClick={() => {
          if (reading) stopReading();
          else startReading(id, pieces);
        }}
        className={cn(buttonClass, className)}
        data-testid={testId}
      >
        {reading ? (
          <Square aria-hidden="true" className="h-5 w-5 shrink-0 fill-current" />
        ) : (
          <Volume2 aria-hidden="true" className="h-5 w-5 shrink-0" />
        )}
        {reading ? words.stop : (label ?? words.start)}
      </button>
      {/* Always in the tree (visually removed while empty, never display:none) so the announcement is made when the text appears. */}
      <p
        role="status"
        className={cn("basis-full text-sm text-foreground/80 print:hidden", !failed && "sr-only")}
        data-testid={`${testId}-status`}
      >
        {failed ? words.unavailable : null}
      </p>
    </>
  );
}
