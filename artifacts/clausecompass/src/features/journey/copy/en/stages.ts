/**
   * The life moments (PRD §5 step 1), by the stage id the rule engine keys on
   * (stages.ts). `example` is shown to the reader, so it must read as their
   * situation, never as an internal persona name.
   */
  export const stages = {
    "before-signing": {
      label: "Before signing",
      description:
        "An offer letter, rent agreement, NDA or loan you have been asked to sign. See what the document says you would be agreeing to, and what to ask before you do.",
      example: "For example: a first job offer, or an NDA a client has sent over.",
    },
    "problem-started": {
      label: "A problem started",
      description:
        "A dispute, notice or missed payment on an agreement you already signed. Find the wording that talks about it and build a dated timeline of what happened.",
      example: "For example: a landlord's message about leaving, or a deposit that has not come back.",
    },
    "compare-versions": {
      label: "Compare two versions",
      description:
        "An old and a new version of terms, a policy or a contract. See what changed, clause by clause, in plain language.",
      example: "For example: a subscription's updated terms, or a renewal with changed rent or fees.",
    },
  };
