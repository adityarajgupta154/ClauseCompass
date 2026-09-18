import { minutesPhrase } from "./shared";

/**
   * The safety screen (PRD §8, the escalation branch): shown when the
   * reader's own words mention a threat or violence, being forced or held, a
   * child at risk, or not wanting to live. Every number and service name on
   * it comes from the resource registry (FR-10); this copy only frames them.
   * It says what the code did — read the words here, stopped short of the
   * analysis, deleted the session — and offers no way to carry on with the
   * document, only a way to start again from the beginning.
   */
  export const safety = {
    heading: "Your safety comes first",
    /** Per escalation category: the heading of the emergency panel and the sentence under it. */
    categories: {
      danger: {
        heading: "If you are in danger now",
        body: "You wrote about a threat or violence. ClauseCompass stops here when that comes up: the police and the emergency services can act on it, and a document can wait.",
      },
      coercion: {
        heading: "If someone is forcing or holding you",
        body: "You wrote about being forced, held or threatened into something. ClauseCompass stops here when that comes up: the police and the emergency services can act on it, and a document can wait.",
      },
      "child-safety": {
        heading: "If a child is at risk",
        body: "You wrote about a child who may be at risk. ClauseCompass stops here when that comes up: the Child Helpline and the emergency services can act on it, and a document can wait.",
      },
      "self-harm": {
        heading: "If you are thinking of ending your life",
        body: "You wrote about not wanting to live. If that is how you feel right now, talking to someone comes before any document: the helpline below is free and answered by a counsellor, and the emergency number is there too.",
      },
    },
    call: (number: string) => `Call ${number}`,
    why: {
      heading: "Why you are seeing this",
      /** No quote-back of the reader's words: the sentence above names what was read in general terms, and the words themselves are not kept. */
      body: "ClauseCompass read your answer here, in your browser, and it mentioned harm to a person. It treats that as coming before any document, so it did not go on to the analysis. Nothing you typed was sent anywhere, and the words were not kept.",
      mismatch: "If this does not describe your situation, you can start again from the beginning below; the document would need to be uploaded once more.",
    },
    routes: {
      heading: "Who can act on this",
      more: "All official help for safety, including free legal aid",
    },
    document: {
      heading: "Your document",
      notAnalysed: "ClauseCompass has not analysed it from here and will not.",
      /** By what the server has answered about the session's deletion; the screen never claims more than it knows. */
      deleting: "The text it had read for this session is being deleted, along with anything prepared from it.",
      deleted: "The text it had read for this session has been deleted, along with anything prepared from it.",
      unconfirmed: (ttlMinutes: number) =>
        `ClauseCompass asked for the text it had read for this session to be deleted, but could not confirm that just now. The server deletes it on its own ${minutesPhrase(ttlMinutes)} after your last action, and nothing is analysed in the meantime.`,
    },
    startOver: "Start again from the beginning",
  };
