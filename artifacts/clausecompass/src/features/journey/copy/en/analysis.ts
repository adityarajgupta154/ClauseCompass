/** Shared by every analysis screen (map, review prompts): the request either way is the same file, posted once. */
  export const analysis = {
    documentSummary: (kind: string, paragraphs: number, pages: number | null) =>
      `${kind.toUpperCase()} · ${paragraphs} paragraphs${pages === null ? "" : ` · ${pages} pages`}`,
    /** File names as they read mid-sentence: "a.pdf", "a.pdf and b.pdf". */
    fileNames: (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`),
    errors: {
      generic: "Something went wrong on the way to ClauseCompass. Try again in a moment.",
      offline: "ClauseCompass could not be reached. Try again in a moment.",
      retry: "Try again",
      /** After a session has ended (the API's 404): back to the upload screen, where the chosen files still are. */
      uploadAgain: "Upload the document again",
    },
  };
