import type { StageId } from "./contract";
import { type IsoDate, daysBetween, isoDateSchema } from "./dates";
import { RULE_REGISTRY } from "./registry";
import {
  type GuidanceKey,
  SAFETY_CUES,
  type SafetyCategory,
  type SafetyCueMatch,
  detectSafetyCues,
} from "./safety-cues";
import type { RuleRegistry } from "./schema";
import { STAGE_PLANS, type StagePlan, lookForRules } from "./stage-plans";

/**
 * The Context Decision Flow (PRD §8): an explicit state machine that decides
 * what the product does next from the person's situation, before any model
 * is involved. Four states, three events, no clock of its own:
 *
 *   awaiting-stage ──stage-chosen──▶ review ──deadline ≤ 7 days──▶ urgent-review
 *         │                             │                              │
 *         └──────── user-said with a safety cue (from any state) ──────┘
 *                                       ▼
 *                              safety-escalation  (absorbing: analysis is skipped)
 *
 * Everything the machine reads from a document arrives as typed data (a
 * deadline date), never as free text: only what the person types is scanned
 * for safety cues, so an instruction planted inside a document cannot move
 * the flow.
 */

export const FLOW_VERSION = "2026-09-14";

/** A deadline this close (or already passed) puts the flow in urgent-review. */
export const URGENT_WITHIN_DAYS = 7;

export const FLOW_STATUSES = ["awaiting-stage", "review", "urgent-review", "safety-escalation"] as const;
export type FlowStatus = (typeof FLOW_STATUSES)[number];

export type TextOrigin = "interview" | "question";
export type DeadlineOrigin = "user" | "document";

export interface Urgency {
  deadline: IsoDate;
  /** Whole days from today; 0 is today, negative is already past. */
  daysLeft: number;
  pastDue: boolean;
  origin: DeadlineOrigin;
  /** The caller's name for the deadline ("reply to the notice"); data, shown as-is. */
  label: string | null;
}

export interface SafetyEscalation {
  category: SafetyCategory;
  /** Every cue that fired, most specific first. */
  cues: readonly SafetyCueMatch[];
  /** Routes to lead with, de-duplicated, the primary cue's first. */
  guidance: readonly GuidanceKey[];
  origin: TextOrigin;
}

export interface FlowState {
  status: FlowStatus;
  stage: StageId | null;
  urgency: Urgency | null;
  safety: SafetyEscalation | null;
}

export type FlowEvent =
  | { type: "stage-chosen"; stage: StageId }
  /** Free text the person typed: an interview answer or a question. */
  | { type: "user-said"; text: string; origin: TextOrigin }
  /** A dated deadline, from an interview answer or from the document's timeline. */
  | { type: "deadline-known"; date: IsoDate; origin: DeadlineOrigin; label?: string };

export interface FlowClock {
  /** The reader's calendar day, `YYYY-MM-DD`. Supplied by the caller so the flow stays pure. */
  today: IsoDate;
}

export const INITIAL_FLOW_STATE: FlowState = Object.freeze({
  status: "awaiting-stage",
  stage: null,
  urgency: null,
  safety: null,
});

function statusFor(stage: StageId | null, urgency: Urgency | null): FlowStatus {
  if (stage === null) return "awaiting-stage";
  return urgency ? "urgent-review" : "review";
}

const ORIGIN_RANK: Record<DeadlineOrigin, number> = { user: 0, document: 1 };

/**
 * Upcoming beats past-due; then the fewer days left (or the more recently
 * missed) wins. Same day: the person's own deadline beats one read from the
 * document, a labelled one beats an unlabelled one, then the label's text —
 * so the pick never depends on the order the deadlines arrived in.
 */
function moreUrgent(candidate: Urgency, current: Urgency | null): boolean {
  if (!current) return true;
  if (candidate.pastDue !== current.pastDue) return !candidate.pastDue;
  if (candidate.daysLeft !== current.daysLeft) {
    return candidate.pastDue ? candidate.daysLeft > current.daysLeft : candidate.daysLeft < current.daysLeft;
  }
  if (candidate.origin !== current.origin) return ORIGIN_RANK[candidate.origin] < ORIGIN_RANK[current.origin];
  if ((candidate.label === null) !== (current.label === null)) return candidate.label !== null;
  return candidate.label !== null && current.label !== null && candidate.label < current.label;
}

const CUE_RANK = new Map(SAFETY_CUES.map((cue, index) => [cue.id, index]));
const TEXT_ORIGIN_RANK: Record<TextOrigin, number> = { interview: 0, question: 1 };

interface FoundCue {
  cue: SafetyCueMatch;
  origin: TextOrigin;
}

/**
 * Builds the escalation from every cue found, in lexicon order (the most
 * specific route first), not in the order the texts were typed, so two
 * readers who said the same things get the same screen.
 */
function escalationFrom(found: FoundCue[]): SafetyEscalation | null {
  if (found.length === 0) return null;
  const ordered = [...found].sort(
    (a, b) =>
      (CUE_RANK.get(a.cue.cueId) ?? 99) - (CUE_RANK.get(b.cue.cueId) ?? 99) ||
      TEXT_ORIGIN_RANK[a.origin] - TEXT_ORIGIN_RANK[b.origin] ||
      (a.cue.matched < b.cue.matched ? -1 : a.cue.matched > b.cue.matched ? 1 : 0),
  );
  const cues: SafetyCueMatch[] = [];
  const seen = new Set<string>();
  for (const { cue } of ordered) {
    const key = `${cue.cueId}\u0000${cue.matched.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      cues.push(cue);
    }
  }
  const guidance: GuidanceKey[] = [];
  for (const cue of cues) for (const key of cue.guidance) if (!guidance.includes(key)) guidance.push(key);
  return Object.freeze({
    category: cues[0]!.category,
    cues: Object.freeze(cues),
    guidance: Object.freeze(guidance),
    origin: ordered[0]!.origin,
  });
}

function escalated(state: FlowState, safety: SafetyEscalation): FlowState {
  return { ...state, status: "safety-escalation", safety };
}

/** One step of the machine. Pure: returns the same state object when nothing changes. */
export function transition(state: FlowState, event: FlowEvent, clock: FlowClock): FlowState {
  if (state.status === "safety-escalation") return state;

  switch (event.type) {
    case "stage-chosen":
      return { ...state, stage: event.stage, status: statusFor(event.stage, state.urgency) };

    case "user-said": {
      const safety = escalationFrom(detectSafetyCues(event.text).map((cue) => ({ cue, origin: event.origin })));
      return safety ? escalated(state, safety) : state;
    }

    case "deadline-known": {
      const daysLeft = daysBetween(isoDateSchema.parse(clock.today), isoDateSchema.parse(event.date));
      if (daysLeft > URGENT_WITHIN_DAYS) return state;
      const candidate: Urgency = {
        deadline: event.date,
        daysLeft,
        pastDue: daysLeft < 0,
        origin: event.origin,
        label: event.label ?? null,
      };
      if (!moreUrgent(candidate, state.urgency)) return state;
      return { ...state, urgency: candidate, status: statusFor(state.stage, candidate) };
    }
  }
}

export function applyEvents(state: FlowState, events: readonly FlowEvent[], clock: FlowClock): FlowState {
  return events.reduce((current, event) => transition(current, event, clock), state);
}

/** A snapshot of what is known about the person's situation. */
export interface FlowContext {
  stage?: StageId | null;
  userTexts?: ReadonlyArray<{ text: string; origin: TextOrigin }>;
  deadlines?: ReadonlyArray<{ date: IsoDate; origin: DeadlineOrigin; label?: string }>;
}

export type DocumentAnalysis = "run" | "skip" | "wait";
export type AnswerStyle = "brief" | "full";

/** What the rest of the pipeline should do, as data. */
export interface Decision {
  flowVersion: string;
  state: FlowState;
  status: FlowStatus;
  /** `skip` in safety-escalation, `wait` until a stage is chosen, else `run`. */
  documentAnalysis: DocumentAnalysis;
  plan: StagePlan | null;
  /** Rule ids to look for first, in priority order; empty when analysis does not run. */
  lookFor: string[];
  urgency: Urgency | null;
  safety: SafetyEscalation | null;
  /** `brief` under a close deadline: no long speculative answers. */
  answerStyle: AnswerStyle;
  /** Under a close deadline the reader is told to reach a professional or official service promptly. */
  adviseOfficialContact: boolean;
}

export function describeState(state: FlowState, registry: RuleRegistry = RULE_REGISTRY): Decision {
  const escalated = state.status === "safety-escalation";
  const running = state.status === "review" || state.status === "urgent-review";
  const plan = running && state.stage ? STAGE_PLANS[state.stage] : null;
  return {
    flowVersion: FLOW_VERSION,
    state,
    status: state.status,
    documentAnalysis: escalated ? "skip" : running ? "run" : "wait",
    plan,
    lookFor: plan ? lookForRules(plan.stage, registry) : [],
    urgency: escalated ? null : state.urgency,
    safety: state.safety,
    answerStyle: state.urgency && !escalated ? "brief" : "full",
    adviseOfficialContact: Boolean(state.urgency) && !escalated,
  };
}

/**
 * Decides from a snapshot. The same facts give the same decision whatever
 * order they were collected in: every user text is scanned and the cues are
 * combined in lexicon order before the (absorbing) escalation is entered;
 * otherwise the stage and then the deadlines are applied, and deadline ties
 * are broken by content, not arrival.
 */
export function decide(context: FlowContext, clock: FlowClock, registry: RuleRegistry = RULE_REGISTRY): Decision {
  const found: FoundCue[] = [];
  for (const said of context.userTexts ?? []) {
    for (const cue of detectSafetyCues(said.text)) found.push({ cue, origin: said.origin });
  }
  const safety = escalationFrom(found);
  if (safety) return describeState(escalated(INITIAL_FLOW_STATE, safety), registry);

  const events: FlowEvent[] = [];
  if (context.stage) events.push({ type: "stage-chosen", stage: context.stage });
  for (const deadline of context.deadlines ?? []) {
    events.push({
      type: "deadline-known",
      date: deadline.date,
      origin: deadline.origin,
      ...(deadline.label !== undefined && { label: deadline.label }),
    });
  }
  return describeState(applyEvents(INITIAL_FLOW_STATE, events, clock), registry);
}
