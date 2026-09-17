import { type ReactNode } from "react";
import { Redirect } from "wouter";
import { useJourney } from "./journey-context";

/**
 * Gate for every step after Welcome. A stage can only be chosen on the
 * Welcome screen, below the "information, not advice" boundary, so requiring
 * one here is what guarantees the boundary was shown before any upload UI is
 * reachable (PRD §5 step 1). Deep links without a stage go back to the start.
 */
export function RequireStage({ children }: { children: ReactNode }) {
  const { stage } = useJourney();
  if (stage === null) {
    return <Redirect to="/" replace />;
  }
  return <>{children}</>;
}
