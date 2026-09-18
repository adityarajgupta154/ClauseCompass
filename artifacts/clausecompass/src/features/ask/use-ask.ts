import { useCallback, useEffect, useRef, useState } from "react";
import { askDocument, type AnswerStyle, type AskResponse } from "@workspace/api-client-react";

/**
 * One question and what became of it. A thread is the exchanges of one
 * visit to the Ask screen, oldest first; it lives in component state and
 * nowhere else, so leaving the screen forgets it, as the copy says.
 */
export type Exchange =
  | { id: number; question: string; style: AnswerStyle; status: "asking" }
  | { id: number; question: string; style: AnswerStyle; status: "answered"; answer: AskResponse }
  | { id: number; question: string; style: AnswerStyle; status: "failed"; error: unknown };

export interface AskThread {
  thread: Exchange[];
  /** A question is in flight; the screen takes one at a time. */
  busy: boolean;
  /** Sends a question the flow has already read (the screen runs `say` first). */
  ask: (question: string, style: AnswerStyle) => void;
  /** Sends a failed exchange's question again, in its place. */
  retry: (id: number) => void;
}

/**
 * Asks the API about the session's document (PRD FR-08), one
 * question at a time. Unlike the prepared outputs, an answer is not cached:
 * the server keeps nothing about a question, and neither does the query
 * cache here, so the same question asked twice is two calls and two
 * answers. Leaving the screen aborts the question in flight.
 */
export function useAsk(sessionId: string): AskThread {
  const [thread, setThread] = useState<Exchange[]>([]);
  const inFlight = useRef<AbortController | null>(null);
  const nextId = useRef(1);

  useEffect(
    () => () => {
      inFlight.current?.abort();
    },
    [],
  );

  const send = useCallback(
    (id: number, question: string, style: AnswerStyle) => {
      const controller = new AbortController();
      inFlight.current = controller;
      const settle = (exchange: Exchange) => {
        if (controller.signal.aborted) return;
        if (inFlight.current === controller) inFlight.current = null;
        setThread((current) => current.map((entry) => (entry.id === id ? exchange : entry)));
      };
      askDocument(sessionId, { question, style }, { signal: controller.signal }).then(
        (answer) => settle({ id, question, style, status: "answered", answer }),
        (error: unknown) => settle({ id, question, style, status: "failed", error }),
      );
    },
    [sessionId],
  );

  const ask = useCallback(
    (question: string, style: AnswerStyle) => {
      if (inFlight.current !== null) return;
      const id = nextId.current;
      nextId.current += 1;
      setThread((current) => [...current, { id, question, style, status: "asking" }]);
      send(id, question, style);
    },
    [send],
  );

  const retry = useCallback(
    (id: number) => {
      if (inFlight.current !== null) return;
      const failed = thread.find((entry) => entry.id === id);
      if (!failed || failed.status !== "failed") return;
      setThread((current) => current.map((entry) => (entry.id === id ? { id, question: failed.question, style: failed.style, status: "asking" } : entry)));
      send(id, failed.question, failed.style);
    },
    [send, thread],
  );

  return { thread, busy: thread.some((entry) => entry.status === "asking"), ask, retry };
}
