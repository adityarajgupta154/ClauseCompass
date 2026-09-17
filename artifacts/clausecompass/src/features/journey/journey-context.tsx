import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { deleteSession as deleteSessionRequest, getSession, type Session } from "@workspace/api-client-react";
import { describeState, type Decision, type FlowState, type SafetyEscalation, type TextOrigin } from "@workspace/rules";
import { isSessionGone } from "@/features/analysis/analysis-error";
import type { SlotFiles, SlotId } from "@/features/document/slots";
import { flowFor, isEscalated, parseStoredEscalation, say as sayToFlow, storedEscalation, type StoredEscalation } from "./flow";
import { isStageId, type StageId } from "./stages";

/**
 * Journey state for one reader's visit: the stage picked on the Welcome
 * screen, the files chosen on the upload screen, and the session the API
 * opened for them when the reader pressed Continue (FR-12).
 *
 * The stage and the session id survive a refresh via sessionStorage, so a
 * person who reloads is not thrown back to the start; both go with the tab.
 * The files themselves live in memory only (File objects cannot be stored),
 * so a session found in storage at start-up belongs to files this page no
 * longer has: it is deleted on the server straight away rather than left to
 * expire, and the reader uploads again.
 *
 * Whenever the files stop matching the session — a file is replaced or
 * removed, the stage changes, the journey resets — the session is ended on
 * the server too, so the copy of the document there never outlives the
 * reader's choice here. The reader can also end it explicitly at any time
 * (deleteSession), which is the FR-12 delete control.
 *
 * The server's retention clock slides on every request it sees; the notice
 * phrases it as "minutes after your last action". Moving between screens is
 * an action even when the destination is already in this browser's memory,
 * so a route change touches the session and learns its fresh expiry. This
 * provider mirrors that clock: when the retention window has passed since
 * the last time it heard from the server, it ends the session on its own —
 * asks the server to delete it (a no-op if the server already has), drops
 * the outputs held here, and sends the reader back to the upload screen with
 * a note saying why — so the browser's copy never quietly outlives the
 * server's, and a tab left open never keeps a session alive.
 *
 * The stage lives inside the decision flow's state (PRD §8; `flow.ts`), and
 * so does a safety escalation: when what the reader typed mentions harm to a
 * person, the flow escalates, this provider sets the document aside (files
 * dropped, session ended on the server) and the router shows the safety
 * screen and nothing else. The escalation is stored with the stage so a
 * refresh cannot un-escalate; only choosing a situation again on the Welcome
 * screen, or starting over, begins a new flow.
 */

const STORAGE_KEY = "clausecompass.journey.v1";

/** Route changes closer together than this share one touch; the server's clock is in minutes. */
const TOUCH_EVERY_MS = 5_000;

interface StoredJourney {
  stage: StageId | null;
  sessionId: string | null;
  /** Written without its cues (`storedEscalation`), read back with an empty cue list. */
  safety: StoredEscalation | null;
}

/**
 * What became of the document when the flow escalated: the session it was
 * read into is asked to delete, and the safety screen says which it is —
 * still being deleted, deleted, or not confirmed (offline, server down), in
 * which case the retention window is the fallback the screen can state.
 */
export interface SetAside {
  status: "deleting" | "deleted" | "unconfirmed";
  ttlMinutes: number;
}

/** The session as the API last described it. */
export interface JourneySession extends Session {
  /**
   * This browser's clock when that description arrived. The expiry timer
   * counts ttlMinutes from here rather than reading expiresAt, so a wrong
   * clock on either side cannot end a session early or late.
   */
  receivedAt: number;
}

interface JourneyContextValue {
  /** The life moment picked on the Welcome screen; null until chosen. */
  stage: StageId | null;
  setStage: (stage: StageId) => void;
  /** Files chosen on the upload screen, by slot. Not persisted. */
  documents: SlotFiles;
  setDocument: (slot: SlotId, file: File) => void;
  clearDocument: (slot: SlotId) => void;
  /** The API session holding the extracted documents; null until the upload screen's Continue. */
  session: JourneySession | null;
  /** The session the upload screen just opened. Any earlier one is ended. */
  setSession: (session: Session) => void;
  /**
   * The explicit delete (FR-12): removes the session and everything prepared
   * in it on the server and in this browser's memory, and clears the journey.
   * Resolves true once that is done; false when the reader had already moved
   * on to another session while the server was confirming (the earlier one
   * is deleted, the new one left as it is). Rejects when the server could not
   * confirm the deletion; the journey is left as it was so the reader can try
   * again.
   */
  deleteSession: () => Promise<boolean>;
  /**
   * Forgets a session the server says has already ended (expired, or
   * deleted from another tab) so the reader can upload again. Local only.
   */
  forgetSession: () => void;
  /** True once, after an explicit delete, until the reader starts again. */
  justDeleted: boolean;
  /** Set when the session ended on its own: the retention window, in minutes, that passed. Cleared when a new session opens. */
  endedAfter: number | null;
  reset: () => void;
  /**
   * The reader who opened the document is no longer the one signed in
   * (signed out from another tab, the sign-in lapsed, or someone else signed
   * in there): everything of the document leaves this browser — files, the
   * session with its prepared outputs, the chosen situation. The server is
   * not asked to end the session: the token that could have carried that
   * request went with the reader, so the retention window ends it, as for a
   * closed tab. A safety escalation stays: that screen never depends on who
   * is signed in.
   */
  forgetReader: () => void;
  /**
   * Something the reader typed, run through the decision flow here in the
   * browser (the text goes no further). Returns the flow's decision so the
   * screen can act on it at once. When the words escalate the flow, the
   * document is set aside in the same step: files dropped, session ended on
   * the server, so no analysis can run on it from here.
   */
  say: (text: string, origin?: TextOrigin) => Decision;
  /** The flow is in safety escalation: every screen of the journey yields to the safety screen. */
  escalated: boolean;
  /** What escalated the flow, for the safety screen; null otherwise. */
  safety: SafetyEscalation | null;
  /** The document's fate after an escalation; null when there was no session to delete, or no escalation. */
  setAside: SetAside | null;
}

const JourneyContext = createContext<JourneyContextValue | null>(null);

function readStored(): { stage: StageId | null; sessionId: string | null; safety: SafetyEscalation | null } {
  const nothing = { stage: null, sessionId: null, safety: null };
  if (typeof window === "undefined") return nothing;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return nothing;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return nothing;
    const { stage, sessionId, safety } = parsed as { stage?: unknown; sessionId?: unknown; safety?: unknown };
    return {
      stage: isStageId(stage) ? stage : null,
      sessionId: typeof sessionId === "string" && sessionId.length > 0 ? sessionId : null,
      safety: parseStoredEscalation(safety),
    };
  } catch {
    return nothing;
  }
}

/** The query cache entries of one session: the map, the prompts, the comparison prepared in it. */
export const sessionQueryKey = (sessionId: string) => ["session", sessionId] as const;

export function JourneyProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [location] = useLocation();
  const [flow, setFlow] = useState<FlowState>(() => {
    const stored = readStored();
    return flowFor(stored.stage, stored.safety);
  });
  const stage = flow.stage;
  const [documents, setDocuments] = useState<SlotFiles>({});
  const [session, setSessionState] = useState<JourneySession | null>(null);
  const [justDeleted, setJustDeleted] = useState(false);
  const [endedAfter, setEndedAfter] = useState<number | null>(null);
  const [setAside, setSetAside] = useState<SetAside | null>(null);
  // The state as the callbacks see it, so ending a session never depends on a stale closure (written in the commit, before any handler can run).
  const sessionRef = useRef<JourneySession | null>(null);
  const flowRef = useRef<FlowState>(flow);
  useLayoutEffect(() => {
    sessionRef.current = session;
    flowRef.current = flow;
  }, [session, flow]);

  /** Drops the session's prepared outputs from this browser's memory and asks the server to delete it; failures only warn. Resolves to whether the server confirmed. */
  const endSession = useCallback(
    (sessionId: string): Promise<boolean> => {
      queryClient.removeQueries({ queryKey: sessionQueryKey(sessionId) });
      return deleteSessionRequest(sessionId).then(
        () => true,
        (error: unknown) => {
          console.warn("ClauseCompass: the session could not be deleted now; it expires on its own.", error);
          return false;
        },
      );
    },
    [queryClient],
  );

  /** Ends the current session, if any, and forgets it. */
  const dropSession = useCallback(() => {
    const current = sessionRef.current;
    if (current === null) return;
    sessionRef.current = null;
    setSessionState(null);
    void endSession(current.id);
  }, [endSession]);

  // A session left in storage by a refresh belongs to files this page no longer has.
  const cleanedUp = useRef(false);
  useEffect(() => {
    if (cleanedUp.current) return;
    cleanedUp.current = true;
    const { sessionId } = readStored();
    if (sessionId !== null) void endSession(sessionId);
  }, [endSession]);

  useEffect(() => {
    try {
      if (flow.stage === null && flow.safety === null && session === null) {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } else {
        const stored: StoredJourney = { stage: flow.stage, sessionId: session?.id ?? null, safety: storedEscalation(flow.safety) };
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      }
    } catch {
      // Storage can be unavailable (private mode, quota); the in-memory state still works.
    }
  }, [flow, session]);

  const setStage = useCallback(
    (next: StageId) => {
      setJustDeleted(false);
      const current = flowRef.current;
      // A different stage needs different slots; drop files chosen for the old one, and the session built on them.
      // Choosing again after an escalation starts over the same way: nothing carries into the new flow.
      if (current.stage !== next || isEscalated(current)) {
        setDocuments({});
        setEndedAfter(null);
        dropSession();
      }
      // Choosing a situation on the Welcome screen begins a new flow; an escalation never carries into it.
      setSetAside(null);
      setFlow(flowFor(next));
    },
    [dropSession],
  );

  const say = useCallback(
    (text: string, origin: TextOrigin = "interview"): Decision => {
      const current = flowRef.current;
      const next = sayToFlow(current, text, origin);
      if (next !== current) {
        flowRef.current = next;
        setFlow(next);
        // Escalation is absorbing, so this runs once per flow: the document is set aside for good.
        if (isEscalated(next) && !isEscalated(current)) {
          setDocuments({});
          setEndedAfter(null);
          const held = sessionRef.current;
          if (held === null) {
            setSetAside(null);
          } else {
            sessionRef.current = null;
            setSessionState(null);
            const ttlMinutes = held.ttlMinutes;
            setSetAside({ status: "deleting", ttlMinutes });
            void endSession(held.id).then((deleted) => {
              // Only this escalation's screen wants the answer; a flow started since has moved on.
              if (flowRef.current === next) setSetAside({ status: deleted ? "deleted" : "unconfirmed", ttlMinutes });
            });
          }
        }
      }
      return describeState(next);
    },
    [endSession],
  );

  const setDocument = useCallback(
    (slot: SlotId, file: File) => {
      setDocuments((current) => ({ ...current, [slot]: file }));
      dropSession();
    },
    [dropSession],
  );

  const clearDocument = useCallback(
    (slot: SlotId) => {
      setDocuments((current) => {
        if (!(slot in current)) return current;
        const next = { ...current };
        delete next[slot];
        return next;
      });
      dropSession();
    },
    [dropSession],
  );

  const setSession = useCallback(
    (next: Session) => {
      const current = sessionRef.current;
      if (current !== null && current.id !== next.id) void endSession(current.id);
      const received: JourneySession = { ...next, receivedAt: Date.now() };
      sessionRef.current = received;
      setSessionState(received);
      setEndedAfter(null);
    },
    [endSession],
  );

  /**
   * The session ended on its own (retention window passed, or the server says
   * it is gone): end it here too and say why. Takes the exact description it
   * applies to — a fresher description of the same session, installed by a
   * touch that landed in the meantime, means this one is no longer current.
   */
  const expireSession = useCallback(
    (expired: JourneySession) => {
      if (sessionRef.current !== expired) return;
      sessionRef.current = null;
      setSessionState(null);
      setEndedAfter(expired.ttlMinutes);
      void endSession(expired.id);
    },
    [endSession],
  );

  // A route change is activity: touch the session so its clock slides, and learn its fresh expiry.
  useEffect(() => {
    const current = sessionRef.current;
    if (current === null || Date.now() - current.receivedAt < TOUCH_EVERY_MS) return;
    // Anchor the fresh description at the request's start: the server's clock started no later than that.
    const requestedAt = Date.now();
    const controller = new AbortController();
    getSession(current.id, { signal: controller.signal }).then(
      (fresh) => {
        if (sessionRef.current?.id !== fresh.id) return;
        const received: JourneySession = { ...fresh, receivedAt: requestedAt };
        sessionRef.current = received;
        setSessionState(received);
      },
      (error: unknown) => {
        // Gone on the server, whichever description of it is current here.
        const now = sessionRef.current;
        if (isSessionGone(error) && now !== null && now.id === current.id) expireSession(now);
      },
    );
    return () => controller.abort();
  }, [location, expireSession]);

  // The retention window passing since the server last described the session: end it here (see the note at the top of the file).
  useEffect(() => {
    if (session === null) return;
    const deadline = session.receivedAt + session.ttlMinutes * 60_000;
    const timer = window.setTimeout(() => expireSession(session), Math.max(0, deadline - Date.now()));
    // A hidden tab's timers run late; coming back to it, settle up straight away rather than show outputs the server no longer has.
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() >= deadline) expireSession(session);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session, expireSession]);

  const reset = useCallback(() => {
    setFlow(flowFor(null));
    setDocuments({});
    setEndedAfter(null);
    setSetAside(null);
    dropSession();
  }, [dropSession]);

  const deleteSession = useCallback(async () => {
    const target = sessionRef.current;
    if (target !== null) {
      await deleteSessionRequest(target.id);
      queryClient.removeQueries({ queryKey: sessionQueryKey(target.id) });
      // The reader moved on to another session while this delete was in flight: that one stays as it is.
      if (sessionRef.current !== target) return false;
    }
    sessionRef.current = null;
    setSessionState(null);
    setFlow(flowFor(null));
    setDocuments({});
    setSetAside(null);
    setJustDeleted(true);
    return true;
  }, [queryClient]);

  const forgetSession = useCallback(() => {
    const current = sessionRef.current;
    if (current === null) return;
    queryClient.removeQueries({ queryKey: sessionQueryKey(current.id) });
    sessionRef.current = null;
    setSessionState(null);
  }, [queryClient]);

  const forgetReader = useCallback(() => {
    setDocuments({});
    setEndedAfter(null);
    if (!isEscalated(flowRef.current)) {
      setFlow(flowFor(null));
      setSetAside(null);
    }
    forgetSession();
  }, [forgetSession]);

  const value = useMemo(
    () => ({
      stage,
      setStage,
      documents,
      setDocument,
      clearDocument,
      session,
      setSession,
      deleteSession,
      forgetSession,
      justDeleted,
      endedAfter,
      reset,
      forgetReader,
      say,
      escalated: isEscalated(flow),
      safety: flow.safety,
      setAside,
    }),
    [stage, setStage, documents, setDocument, clearDocument, session, setSession, deleteSession, forgetSession, justDeleted, endedAfter, reset, forgetReader, say, flow, setAside],
  );

  return <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>;
}

export function useJourney(): JourneyContextValue {
  const value = useContext(JourneyContext);
  if (!value) {
    throw new Error("useJourney must be used inside <JourneyProvider>");
  }
  return value;
}
