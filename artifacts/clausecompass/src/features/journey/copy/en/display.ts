/**
   * The settings menu in the header of every screen (FR-11): the language of
   * the product's own words, the size of the text, the theme, and the way to
   * the help, feedback and about pages. Only the product's words change with
   * the language; the document's wording and the plain-language statements
   * prepared from it stay as they are, and `convenience` says so wherever
   * Hinglish is showing.
   */
  export const display = {
    /** The gear button's name and the panel's. */
    label: "Settings",
    language: {
      label: "Language",
      english: "English",
      hinglish: "Hinglish",
    },
    convenience:
      "Hinglish is convenience text, not the authoritative version. The document's own wording, and every statement prepared from it, is shown as it is, untranslated; the packet is prepared in English.",
    textSize: {
      label: "Text size",
      smaller: "Smaller text",
      larger: "Larger text",
      percent: (percent: number) => `${percent}%`,
      status: (percent: number) => `Text size ${percent}%`,
    },
    theme: {
      label: "Theme",
      light: "Light",
      dark: "Dark",
      system: "System",
    },
    /** The pages the panel leads to; the about link goes to the boundary statement on the welcome screen. */
    links: {
      help: "Help & support",
      feedback: "Give feedback",
      about: "About ClauseCompass",
    },
  };
