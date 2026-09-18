/**
   * Ask about this document (PRD section 5 step 5, FR-08, section 8): one question at a
   * time, answered from the document's own wording or not at all. The
   * answers are English whatever the screen shows; the model's task line is
   * English, and the packet is prepared the same way.
   */
  export const ask = {
    heading: "Ask about this document",
    lead: "Type a question in English or Hinglish. ClauseCompass answers with what the document itself states, each statement resting on the exact wording, or says that the document does not answer it. It does not guess, and it does not say what to do.",
    back: "Back to the document map",
    link: "Ask about this document",
    question: {
      label: "Your question",
      hint: (max: number) =>
        `Up to ${max} characters. Your words are read here in your browser first (a mention of harm to a person brings up official help), then sent to the AI model together with the paragraphs of the document that share their words, and nothing else. Your question is not kept once the answer is back; the document itself stays in your session until it ends, as the upload screen states.`,
      ask: "Ask",
      asking: "Reading the document for an answer. This usually takes a few seconds.",
      samples: {
        heading: "Or try one of these",
        use: "Ask this question",
      },
      sampleQuestions: [
        "What is the notice period?",
        "When is the deposit returned?",
        "Which court handles disputes?",
        "Can I work for a competitor after leaving?",
      ],
    },
    thread: {
      heading: "Your questions",
      asked: "You asked",
      note: "Each question is answered on its own from the document. The questions and answers stay in this browser while this screen is open, and nowhere else.",
    },
    answer: {
      heading: "What the document states",
      brief: "One statement, because your deadline is close: the one the document supports best.",
      withheld: (count: number) =>
        count === 1
          ? "1 further statement was withheld because it could not be verified against the document's wording."
          : `${count} further statements were withheld because they could not be verified against the document's wording.`,
      readAloud: "Read the answer aloud",
    },
    notInDocument: {
      title: "The document does not answer this",
      reasons: {
        "no-evidence": "No paragraph of the document shares the words of your question, so nothing was sent to the AI model.",
        "nothing-verified": "The paragraphs that share its words were read, and no statement about them could be verified against the document's own wording.",
        "low-confidence": "The paragraphs that share its words were read, and the only statements found were weakly supported, so none is shown.",
      },
      takeIt: "The question, as it stands, for a lawyer or a legal-aid service:",
      help: "Official help you can contact",
    },
    errors: {
      title: "The question could not be answered",
      retry: "Ask again",
    },
  };
