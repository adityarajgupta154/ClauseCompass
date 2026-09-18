export const analysis = {
    documentSummary: (kind: string, paragraphs: number, pages: number | null) =>
      `${kind.toUpperCase()} · ${paragraphs} paragraph${pages === null ? "" : ` · ${pages} page`}`,
    fileNames: (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} aur ${names[names.length - 1]}`),
    errors: {
      generic: "ClauseCompass tak pahunchne mein kuch gadbad ho gayi. Thodi der mein phir se try karein.",
      offline: "ClauseCompass tak pahuncha nahi ja saka. Thodi der mein phir se try karein.",
      retry: "Phir se try karein",
      uploadAgain: "Document phir se upload karein",
    },
  };
