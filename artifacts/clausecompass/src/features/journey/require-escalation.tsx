import { type ReactNode } from "react";
import { Redirect } from "wouter";
import { useJourney } from "./journey-context";

/**
 * Gate for the safety screen: it exists only for a flow that has escalated,
 * since everything on it is chosen by what escalated it. A direct visit or a
 * stale bookmark without one goes to the start.
 */
export function RequireEscalation({ children }: { children: ReactNode }) {
  const { escalated } = useJourney();
  if (!escalated) {
    return <Redirect to="/" replace />;
  }
  return <>{children}</>;
}
