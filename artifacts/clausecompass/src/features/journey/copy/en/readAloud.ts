/**
   * Read-aloud (FR-11) with the browser's own speech, so nothing leaves the
   * device. It reads the plain-language statements and the prompts, never
   * anything withheld.
   */
  export const readAloud = {
    start: "Read aloud",
    stop: "Stop reading",
    unavailable: "This browser could not start speech. Its voices may be switched off or not installed.",
    whole: {
      map: "Read the whole map aloud",
      review: "Read all the prompts aloud",
    },
  };
