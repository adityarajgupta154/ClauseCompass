import type { SlotFiles, SlotId } from "@/features/document/slots";
import type { StageId } from "@/features/journey/stages";

/**
 * Which uploaded file the document map is built from. The map describes one
 * document; for a version comparison that is the newer one, the version the
 * reader is being asked to accept. The older version is the compare task's
 * business.
 */
export function slotToAnalyse(stage: StageId): SlotId {
  return stage === "compare-versions" ? "newer" : "primary";
}

export function documentToAnalyse(stage: StageId, documents: SlotFiles): File | null {
  return documents[slotToAnalyse(stage)] ?? null;
}
