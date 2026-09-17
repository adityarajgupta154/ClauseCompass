import { type ReactNode } from "react";
import { Redirect } from "wouter";
import { SAFETY_PATH } from "./flow";
import { useJourney } from "./journey-context";

/**
 * Gate on every route but the safety screen and the helplines, outermost.
 * Once the decision flow has escalated for safety (PRD §8: what the reader
 * typed mentions harm to a person), the safety screen is the only screen:
 * no Welcome, no upload, no questions, no map, no packet, whichever address
 * is typed or stepped back to. The flow cannot leave that state; the safety
 * screen's "Start again" resets it, and only then does Welcome show.
 */
export function RequireNotEscalated({ children }: { children: ReactNode }) {
  const { escalated } = useJourney();
  if (escalated) {
    return <Redirect to={SAFETY_PATH} replace />;
  }
  return <>{children}</>;
}
