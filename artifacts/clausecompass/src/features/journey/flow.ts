import { z } from "zod";
import {
  GUIDANCE_KEYS,
  INITIAL_FLOW_STATE,
  SAFETY_CATEGORIES,
  transition,
  type Decision,
  type FlowClock,
  type FlowState,
  type SafetyEscalation,
  type TextOrigin,
} from "@workspace/rules";
import type { StageId } from "./stages";

/**
 * The decision flow (PRD §8) as this browser runs it. Everything the reader
 * types is scanned here, on their device, by the pure rules library: the text
 * never goes to the API, so the server has nothing to log or keep. The flow
 * emits states and guidance keys only; the safety screen turns the keys into
 * numbers through the resource registry (FR-10).
 *
 * Safety escalation is absorbing in the machine, and this module keeps it
 * that way: the only way out is a fresh machine, which the journey starts
 * when the reader starts again from the beginning.
 *
 * The machine reports which words matched a cue. This module drops them
 * the moment the flow escalates (`say` below): the screens need the category
 * and the guidance keys, nothing else, and the interview promises that the
 * words are not kept. What is held in memory and in sessionStorage is the
 * escalation without its cues.
 */

/** The one screen an escalated journey can show, apart from official help. */
export const SAFETY_PATH = "/safety";

/** The reader's own calendar day, as the flow's clock expects it (`YYYY-MM-DD`). */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function flowClock(now: Date = new Date()): FlowClock {
  return { today: todayIso(now) };
}

/**
 * A machine for the stage the reader chose, with an escalation restored from
 * storage if there was one. The escalated state is the same object the
 * machine's own transition builds (`status` + `safety` on top of the stage
 * state), so a refresh lands where the reader was, never un-escalated.
 */
export function flowFor(stage: StageId | null, safety: SafetyEscalation | null = null, clock: FlowClock = flowClock()): FlowState {
  const base = stage === null ? INITIAL_FLOW_STATE : transition(INITIAL_FLOW_STATE, { type: "stage-chosen", stage }, clock);
  return safety === null ? base : { ...base, status: "safety-escalation", safety };
}

/**
 * One thing the reader typed, run through the machine. The same state comes
 * back when nothing in it changes; an escalation comes back without the
 * matched words (see above).
 */
export function say(flow: FlowState, text: string, origin: TextOrigin, clock: FlowClock = flowClock()): FlowState {
  const next = transition(flow, { type: "user-said", text, origin }, clock);
  return next === flow ? flow : withoutWords(next);
}

/** The escalation reduced to what the screens use — category, guidance, origin — with the cues, and the words they matched, gone. */
export function withoutWords(flow: FlowState): FlowState {
  if (flow.safety === null || flow.safety.cues.length === 0) return flow;
  return { ...flow, safety: { ...flow.safety, cues: [] } };
}

export function isEscalated(flow: Pick<FlowState, "status">): boolean {
  return flow.status === "safety-escalation";
}

/**
 * Where the interview goes next: the screen it was heading for, unless the
 * flow has escalated, in which case the safety screen and nothing else. The
 * decision's own `documentAnalysis: "skip"` is what the gates enforce from
 * then on; this only picks the first screen to show it.
 */
export function nextScreen(decision: Pick<Decision, "status">, intended: string): string {
  return isEscalated(decision) ? SAFETY_PATH : intended;
}

/** What sessionStorage holds for an escalation: never the cues. Anything else reads as no escalation. */
const storedEscalationSchema = z
  .object({
    category: z.enum(SAFETY_CATEGORIES),
    guidance: z.array(z.enum(GUIDANCE_KEYS)).min(1),
    origin: z.enum(["interview", "question"]),
  })
  .strict();

export type StoredEscalation = Readonly<z.infer<typeof storedEscalationSchema>>;

export function storedEscalation(safety: SafetyEscalation | null): StoredEscalation | null {
  return safety === null ? null : { category: safety.category, guidance: [...safety.guidance], origin: safety.origin };
}

export function parseStoredEscalation(value: unknown): SafetyEscalation | null {
  const parsed = storedEscalationSchema.safeParse(value);
  return parsed.success ? { ...parsed.data, cues: [] } : null;
}
