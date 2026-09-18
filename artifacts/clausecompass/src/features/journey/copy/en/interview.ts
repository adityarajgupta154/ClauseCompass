import { minutesPhrase } from "./shared";

export const interview = {
    heading: "Next: a few quick questions",
    /** Where the document is now (FR-12): read into the session, not yet shown to any AI model. */
    placeholder: (ttlMinutes: number) =>
      `The rest of the questions step is being built next. ClauseCompass has read your document's text and keeps it for this session: it is deleted ${minutesPhrase(ttlMinutes)} after your last action, or as soon as you press "Delete my document now" below. Nothing has gone to an AI model yet.`,
    documentsLabel: "Ready to analyse",
    back: "Back to upload",
    continueToMap: "Continue to the document map",
    /** The AI model sees passages for the first time on the next screen; say so here, where the button is. */
    continueNote: (documentPhrase: string) =>
      `Pressing this sends passages of ${documentPhrase} to the AI model to prepare the map.`,
    /** The compare stage only: straight to the change cards, skipping the newer version's map and prompts. */
    goToCompare: "Or go straight to what changed between the versions",
    goToCompareNote: "Pressing this lines up the two versions on ClauseCompass. No AI model is involved in that step.",
    /**
     * The one open question asked before any analysis (PRD §5 step 3, §8):
     * whatever the reader types is scanned in the browser for a mention of
     * harm to a person, and that decides whether the next screen is the
     * document map or the safety screen. The hint states exactly what the
     * code does with the words: read here, never sent, not kept.
     */
    situation: {
      label: "Before the document: is there anything about your situation to say first?",
      hint: "Optional. A sentence or two in your own words, in English or Hinglish. ClauseCompass reads it here, in your browser, to decide which screen comes next: when it mentions harm to a person, official help comes before the document. The words are not sent to ClauseCompass or to any AI model, and they are not kept when you leave this screen.",
      /** Synthetic answers from samples/interview-answers.json, so the safety screen can be reached in a demo without anyone typing a real crisis. */
      samples: {
        heading: "Try a sample answer",
        lead: "Written for the demo: none of them is a real person's words. Choosing one fills the box; nothing happens until you press Continue.",
        use: "Use this answer",
        loaded: (title: string) => `The sample answer “${title}” is in the box. Press Continue to go on.`,
      },
    },
  };
