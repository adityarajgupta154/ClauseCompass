/** The citation primitive (SourceCard) and its withheld state. */
  /**
   * The Review Prompts screen (FR-06). Every sentence here is a product
   * sentence, so the responsible-language lint runs over this block in the
   * tests: name the wording, ask the reader to check it, never conclude.
   */
  export const review = {
    heading: "Your review prompts",
    lead: "The clauses in this document that are worth a closer look at this moment, each with the question to put to the other side or to an adviser. Every prompt shows the wording it rests on.",
    back: "Back to the document map",
    status: {
      analysing: (name: string) => `Reading ${name} and preparing the review prompts. This usually takes a few seconds.`,
      sent: (name: string) =>
        `These prompts were prepared from the text of ${name} held in your session; the passages they rest on were sent to the AI model. ClauseCompass deletes that text and these prompts when the session ends: when you delete it, or on its own after the time stated on the upload screen.`,
    },
    errors: {
      title: "The review prompts could not be prepared",
    },
    continueToCompare: "Continue to what changed",
    continueToPacket: "Continue to your preparation packet",
    groups: {
      primary: {
        title: "Check first",
        description: "The clauses that matter most at this moment. Read each one and ask the question before you decide.",
      },
      secondary: {
        title: "Also worth checking",
        description: "Clauses that usually matter less right now but are in this document.",
      },
      background: {
        title: "Other clauses found",
        description: "Found in the document; the prompt for each is the standard check for that kind of clause.",
      },
    },
    family: {
      money: "Money",
      time: "Dates and duration",
      duty: "Duties and restrictions",
      exit: "Ending and disputes",
      "data-ip": "Information and data",
    },
    card: {
      /** Read before the family name by screen readers, so the badge is announced as "Topic: Money". */
      topic: "Topic:",
      places: (count: number) => (count === 1 ? "Found in 1 place" : `Found in ${count} places`),
      showMorePlaces: (count: number) => (count === 1 ? "Show 1 more place" : `Show ${count} more places`),
      showFewerPlaces: "Show fewer places",
      showParagraph: "Show the paragraph",
      hideParagraph: "Hide the paragraph",
      template: {
        title: "Standard check for this kind of clause",
        reasons: {
          "model-unavailable":
            "The plain-language rephrasing service was unavailable, so this prompt is the standard one for this kind of clause rather than one written for this document.",
          "nothing-verified":
            "The plain-language rephrasing for this clause could not be verified against the document, so this prompt is the standard one for this kind of clause instead.",
          "not-asked":
            "This clause is not among the ones that lead at this moment, so it was not sent for rephrasing; this prompt is the standard one for this kind of clause.",
        },
      },
    },
    withheld: (count: number) =>
      count === 1
        ? "1 rephrasing was withheld because it could not be verified against the clause it was written for; the standard prompt is shown in its place."
        : `${count} rephrasings were withheld because they could not be verified against the clause they were written for; the standard prompt is shown in each place.`,
    notFound: {
      title: "Not found in this document",
      description:
        "Clauses that often matter at this moment and that ClauseCompass looked for without finding. The document may still cover them in words it does not recognise, so if you expected one, ask about it rather than assuming the document is silent.",
    },
    empty: {
      title: "No review prompts for this document",
      body: "ClauseCompass found none of the clauses it looks for. That does not mean there is nothing to ask about; it means the document uses words it does not recognise. Read it with an adviser.",
    },
  };
