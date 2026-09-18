/** The two-version comparison (FR-07): change cards, one per paragraph that differs. */
  export const compare = {
    heading: "What changed between the versions",
    lead: "Each paragraph of the newer version set against the older one. Where the wording differs, both versions are shown side by side with the changed words marked, and each change is sorted by what it touches: money, time, duties, remedies, or wording only.",
    back: "Back to the review prompts",
    status: {
      analysing: (names: string) => `Reading ${names} and lining up the two versions. This usually takes a few seconds.`,
      sent: (names: string) =>
        `The two versions were lined up from the text of ${names} held in your session. No AI model takes part in this comparison. ClauseCompass deletes that text and this comparison when the session ends: when you delete it, or on its own after the time stated on the upload screen.`,
    },
    errors: {
      title: "The versions could not be compared",
    },
    summary: {
      title: "In brief",
      changes: (count: number) => (count === 1 ? "1 change" : `${count} changes`),
      unchanged: (count: number) => (count === 1 ? "1 paragraph the same" : `${count} paragraphs the same`),
      added: (count: number) => (count === 1 ? "1 paragraph added" : `${count} paragraphs added`),
      removed: (count: number) => (count === 1 ? "1 paragraph removed" : `${count} paragraphs removed`),
      byKind: (label: string, count: number) => `${label}: ${count}`,
    },
    /** What each kind of change is, and what to look at. Static per kind; the card's own words are the two excerpts. */
    kinds: {
      money: {
        label: "Money",
        check: "This touches an amount, a fee, or a percentage. Check the figures against what was agreed, and whether anything else in the document is worked out from them.",
      },
      time: {
        label: "Time",
        check: "This touches a date, a period, or a deadline. Work out what the newer version gives you or takes away, and by when.",
      },
      duty: {
        label: "Duties",
        check: "This touches who must do what, or what is allowed. Check which side the newer wording binds, and whether a permission or a consent step has gone.",
      },
      remedy: {
        label: "Remedies",
        check: "This touches what follows when something goes wrong: a right to end, deduct, forfeit, or claim. Read the consequence in the newer version in full before you accept it.",
      },
      wording: {
        label: "Wording",
        check: "The words differ, but none of the amounts, dates, duties, or remedies ClauseCompass looks for changed. Read it once to see whether the meaning is the same.",
      },
    },
    statuses: {
      changed: "Changed",
      added: "Added in the newer version",
      removed: "Removed in the newer version",
    },
    card: {
      /** Read before the kind by screen readers, so the badge is announced as "Change to: Money". */
      kind: "Change to:",
      older: "Older version",
      newer: "Newer version",
      notInOlder: "This paragraph is not in the older version.",
      notInNewer: "This paragraph is not in the newer version.",
      /** Read before a marked run by screen readers; the marking itself is visual. */
      removedWord: "removed:",
      addedWord: "added:",
      keyTerms: "Key terms",
      terms: (side: string, terms: string[]) => `${side}: ${terms.join(", ")}`,
      alsoTouches: (labels: string[]) => `Also touches ${labels.join(", ")}.`,
    },
    empty: {
      title: "No differences found",
      body: "The two files read the same, paragraph for paragraph, apart from capitalisation and quote marks. If you expected changes, check that these are the two versions you meant to compare.",
    },
    note: "Paragraphs are matched in order, so a clause that moved to another place in the document appears once as removed and once as added. The sorting comes from the words that changed, not from reading the whole clause; treat it as a first pass, and read each card in full.",
    continueToPacket: "Continue to your preparation packet",
  };
