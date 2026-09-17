import { type ReactNode } from "react";
import { Redirect } from "wouter";
import { hasAllDocuments } from "@/features/document/slots";
import { useJourney } from "./journey-context";

/**
 * Gate for steps after upload: every slot the stage needs must hold a file,
 * and the API session opened for those files must exist. Files live in
 * memory only, so a refresh here goes back to the upload screen
 * (RequireStage, wrapped outside, still sends stage-less visitors to "/").
 */
export function RequireDocuments({ children }: { children: ReactNode }) {
  const { stage, documents, session } = useJourney();
  if (stage === null || session === null || !hasAllDocuments(stage, documents)) {
    return <Redirect to="/upload" replace />;
  }
  return <>{children}</>;
}
