import { copy } from "@/features/journey/copy";
import type { StageId } from "@/features/journey/stages";

/** Which document(s) a stage needs. Compare needs two; everything else one. */
export const SLOT_IDS = ["primary", "older", "newer"] as const;
export type SlotId = (typeof SLOT_IDS)[number];

export interface Slot {
  id: SlotId;
  label: string;
}

export function slotsForStage(stage: StageId): Slot[] {
  if (stage === "compare-versions") {
    return [
      { id: "older", label: copy.upload.slots.older },
      { id: "newer", label: copy.upload.slots.newer },
    ];
  }
  return [{ id: "primary", label: copy.upload.slots.primary }];
}

export type SlotFiles = Partial<Record<SlotId, File>>;

export function hasAllDocuments(stage: StageId, files: SlotFiles): boolean {
  return slotsForStage(stage).every((slot) => files[slot.id] !== undefined);
}
