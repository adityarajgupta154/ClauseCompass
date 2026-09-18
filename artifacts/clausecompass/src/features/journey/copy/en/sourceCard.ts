export const sourceCard = {
    show: (count: number) => (count > 1 ? `Show sources (${count})` : "Show source"),
    hide: (count: number) => (count > 1 ? `Hide sources (${count})` : "Hide source"),
    excerptLabel: "Exact wording from the document",
    moreLocations: (count: number) => (count === 1 ? "and 1 more" : `and ${count} more`),
    lowConfidence: "Weak match with the document. Read the source wording before relying on this.",
    unresolved: (count: number) =>
      count === 1
        ? "1 further cited passage could not be found in this document and is not shown."
        : `${count} further cited passages could not be found in this document and are not shown.`,
    location: {
      clause: (label: string) => `Clause ${label}`,
      page: (page: number) => `Page ${page}`,
      paragraph: (index: number) => `paragraph ${index}`,
      paragraphOnly: (index: number) => `Paragraph ${index}`,
      separator: " · ",
    },
    fallback: {
      title: "Not shown: no verified source in your document",
      reasons: {
        "no-citations": "This statement did not point to any passage of your document.",
        "unresolved-citations":
          "The passages this statement pointed to could not be matched to your document.",
        "invalid-claim": "This statement arrived in a form ClauseCompass could not check.",
      },
      why: "ClauseCompass only shows statements it can trace to your document's own wording, so this one was withheld instead of being shown unverified.",
    },
  };
