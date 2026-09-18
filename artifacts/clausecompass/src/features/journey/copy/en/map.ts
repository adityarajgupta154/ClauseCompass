/** The Document Map (FR-04) and the date timeline (FR-05). */
  export const map = {
    heading: "Your document map",
    lead: "What the document says on six points, in plain language. Every statement shows the exact wording it rests on; when a point is not in the document, it says so.",
    back: "Back to the questions",
    continueToReview: "Continue to the review prompts",
    /**
     * Status copy (FR-12): factual about where the document is. Its text
     * sits in the session on ClauseCompass, passages of it went to the AI
     * model for this output, and both go when the session ends: on the
     * delete control, or on its own after the session's idle limit.
     */
    status: {
      analysing: (name: string) => `Reading ${name} and preparing the map. This usually takes a few seconds.`,
      sent: (name: string) =>
        `This map was prepared from the text of ${name} held in your session; the passages it rests on were sent to the AI model. ClauseCompass deletes that text and this map when the session ends: when you delete it, or on its own after the time stated on the upload screen.`,
    },
    errors: {
      title: "The map could not be prepared",
    },
    fields: {
      parties: {
        title: "Who is bound by it",
        description: "The parties to the document and the role each one plays.",
        missing: "party or role wording",
      },
      dates: {
        title: "How long it lasts",
        description: "When it starts and ends, deadlines, and what a renewal or extension needs.",
        missing: "term, deadline or renewal wording",
      },
      money: {
        title: "Money",
        description: "What has to be paid, when, deposits and how they come back, and any fee or penalty.",
        missing: "payment, deposit or penalty wording",
      },
      duties: {
        title: "Duties and restrictions",
        description: "What each side must do, must not do, and what one side may decide alone.",
        missing: "duty or restriction wording",
      },
      termination: {
        title: "How it can end",
        description: "Who can end it, with how much notice, any lock-in, and what happens on ending.",
        missing: "notice, termination or lock-in wording",
      },
      dispute: {
        title: "If there is a dispute",
        description: "Which law applies, which courts or authority decide, and whether it provides for arbitration.",
        missing: "governing-law, jurisdiction or dispute wording",
      },
    },
    notFound: {
      title: "Not found in this document",
      body: (missing: string) =>
        `ClauseCompass looked for ${missing} and found none. The document may still cover this in words it does not recognise, so if you expected it here, ask about it rather than assuming the document is silent.`,
    },
    wordingOnly: {
      title: "Shown in the document's own words",
      reasons: {
        "model-unavailable":
          "The plain-language rephrasing service was unavailable, so the passages ClauseCompass located are shown exactly as written instead.",
        "nothing-verified":
          "None of the plain-language rephrasings could be verified against the document, so the passages ClauseCompass located are shown exactly as written instead.",
      },
    },
    withheld: (count: number) =>
      count === 1
        ? "1 further statement was withheld because it could not be verified against the document."
        : `${count} further statements were withheld because they could not be verified against the document.`,
    /** Category keys are the rule registry's; the labels are the reader's. */
    topics: {
      parties: "Parties",
      date: "Date",
      term: "Term",
      renewal: "Renewal",
      deadline: "Deadline",
      payment: "Payment",
      deposit: "Deposit",
      penalty: "Late fee or penalty",
      bond: "Bond or repayment",
      discretionary: "At one side's discretion",
      charges: "Who pays what",
      "non-compete": "Non-compete",
      "non-solicit": "Non-solicit",
      restriction: "Restriction",
      "one-sided": "One-sided term",
      upkeep: "Upkeep",
      hours: "Working hours",
      "one-way": "One-way obligation",
      condition: "Condition",
      notice: "Notice period",
      "notice-service": "How notice is given",
      termination: "Termination",
      "lock-in": "Lock-in or minimum period",
      handover: "On ending",
      dispute: "Dispute",
    } as Record<string, string>,
  };
