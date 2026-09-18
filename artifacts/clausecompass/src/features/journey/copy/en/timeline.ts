export const timeline = {
    heading: "Dates in this document",
    lead: "Every full date the document writes out, in order, with the sentence it appears in. Recurring days such as \"the 5th of every month\" are under Money, not here.",
    empty: {
      title: "No full dates found in this document",
      body: "The document does not write out any complete date (day, month and year). Periods such as \"eleven months\" are under How long it lasts.",
    },
    asWritten: (text: string) => `Written as "${text}"`,
    ambiguity: {
      "day-month-order": (alternative: string) =>
        `Could also mean ${alternative}: the document does not say which number is the day and which the month.`,
      "two-digit-year": "The year is written with two digits and is read as a 20xx year.",
    },
    ambiguityCheck: "Check before relying on it.",
    ambiguityLabel: "Uncertain date",
    topicsLabel: "Also relevant to",
    locale: "en-IN",
  };
