import { type CompiledDetection, compileDetection, matchDetection } from "./engine";
import { deepFreeze } from "./freeze";
import type { Detection } from "./schema";

/**
 * Document text is data, never an instruction (PRD §8 last row, §9 "prompt
 * injection"). The flow enforces that structurally: nothing read from a
 * document can enter it as free text, only as typed facts (a date, a rule
 * hit). This module adds the visible half of the defence: paragraphs that
 * *look* like instructions to an AI system are flagged, so the pipeline can
 * log them and the UI can say the passage was read as document content only.
 * A flag changes nothing else; the paragraph still goes through the same
 * rules as any other.
 */

export const INSTRUCTION_CUES: Detection = deepFreeze({
  any: [
    String.raw`\bignore (?:all |any |the |your )?(?:previous|prior|above|earlier|preceding|foregoing) (?:instructions?|prompts?|rules|guidance|messages?)\b`,
    String.raw`\bdisregard (?:all |any |the |your )?(?:previous|prior|above|earlier) (?:instructions?|prompts?|rules)\b`,
    String.raw`\b(?:system|developer|hidden|secret) prompt\b`,
    String.raw`\byou are (?:an? |the )?(?:ai|assistant|language model|llm|chatbot|model)\b`,
    String.raw`\bas an (?:ai|assistant|language model)\b`,
    String.raw`\b(?:assistant|ai|model|system)\s*:\s*(?:you |please |now |always |never |ignore |reveal |output |respond )`,
    String.raw`\b(?:reveal|print|output|repeat|leak|show) (?:your |the )?(?:system prompt|instructions|hidden prompt|api key|secret)\b`,
    String.raw`\b(?:respond|reply|answer|output) (?:only )?(?:with|in) (?:json|the following|exactly|this text)\b`,
    String.raw`\bmark (?:this|the) (?:document|agreement|contract|clause) (?:as )?(?:safe|fair|standard|compliant|approved)\b`,
    String.raw`\b(?:skip|bypass|disable|turn off) (?:the )?(?:analysis|safety|escalation|validation|checks?|review)\b`,
    String.raw`\b(?:tell|inform|assure) the user (?:that )?(?:this|the|it)\b`,
    String.raw`<\/?(?:system|instruction|prompt|assistant|user)>`,
    String.raw`\[(?:system|inst|assistant)\]`,
  ],
});

let compiled: CompiledDetection | null = null;

export interface InstructionFlag<C extends { text: string } = { text: string }> {
  chunkIndex: number;
  chunk: C;
  /** The wording that looked like an instruction. */
  matched: string;
}

/** True when a piece of document text reads like an instruction to a model. */
export function looksLikeInstruction(text: string): string | null {
  compiled ??= compileDetection(INSTRUCTION_CUES);
  return matchDetection(compiled, text)?.matched ?? null;
}

/** The chunks of a document that carry instruction-like text; data only, nothing is skipped. */
export function flagInstructionChunks<C extends { text: string }>(chunks: readonly C[]): InstructionFlag<C>[] {
  const flags: InstructionFlag<C>[] = [];
  chunks.forEach((chunk, chunkIndex) => {
    const matched = looksLikeInstruction(chunk.text);
    if (matched !== null) flags.push({ chunkIndex, chunk, matched });
  });
  return flags;
}
