import { MAX_FILE_LABEL } from "../../../document/constants";
import { minutesPhrase } from "./shared";

export const upload = {
    heading: "Upload your document",
    headingCompare: "Upload both versions",
    lead: `A PDF, DOCX or TXT file of up to ${MAX_FILE_LABEL}. Scans and photos cannot be read yet, so ask for a text version if that is all you have.`,
    leadCompare:
      `The older and the newer version, each a PDF, DOCX or TXT file of up to ${MAX_FILE_LABEL}. Scans and photos cannot be read yet.`,
    situationLabel: "Your situation",
    change: "Change your situation",
    /** The picture beside the file input on a wide screen: the word on the front sheet and the handwritten line pointing at it (decorative). */
    art: {
      label: "Contract",
      note: "Your document here",
      noteCompare: "Both versions here",
    },
    /** The decorations in the page margins on a wide screen: two handwritten lines beside the heading, a typed line on the papers beside the notice. */
    aside: {
      left: "Same documents. Clearer answers.",
      right: "Upload. Understand. Be prepared.",
      paper: "A fairer tomorrow begins with clearer information.",
    },
    /**
     * Retention notice (PRD FR-12), stated before any file is chosen. Each
     * point describes what the code does: Continue opens the session
     * (createSession), the API keeps only the extracted text and deletes it
     * after `ttlMinutes` idle minutes or on the delete control, and passages
     * go to the AI model only when an output is prepared. The number comes
     * from the API's retention policy; until it is known the rule is stated
     * without one. Whoever changes that behaviour changes this text in the
     * same commit. No claim about the AI provider's own data use is made
     * until the provider is chosen and its terms checked.
     */
    notice: {
      title: "Before you upload: how your document is handled",
      points: (ttlMinutes: number | null) => [
        "Nothing leaves your browser until you press Continue. Choosing a file only reads it here, on your device.",
        `When you press Continue, ClauseCompass reads the document's text and keeps that text for this session only: the file itself is not stored. The text is deleted ${
          ttlMinutes === null ? "automatically a short while after your last action" : `automatically ${minutesPhrase(ttlMinutes)} after your last action`
        }, and you can delete it yourself at any time.`,
        "To rephrase the document in plain language, passages of it are sent to an AI service; the whole file is not. ClauseCompass never uses your document to train anything.",
      ],
    },
    documentsHeadingCompare: "The two versions",
    slots: {
      primary: "Your document",
      older: "Older version",
      newer: "Newer version",
    },
    /** The same slots as they read mid-sentence ("...as the older version"). */
    slotPhrases: {
      primary: "your document",
      older: "the older version",
      newer: "the newer version",
    },
    dropzone: {
      prompt: "Drag a file here, or",
      action: "Choose a file",
      hint: `PDF, DOCX or TXT, up to ${MAX_FILE_LABEL}.`,
      replace: "Replace",
      remove: "Remove",
      readyLabel: "Ready",
    },
    samples: {
      heading: "No document handy? Try a sample",
      lead: "Four made-up documents written for testing; the last is a revised draft of the rental agreement, for comparing versions. Every name, amount and date in them is fictional.",
      use: "Use this sample",
      loading: (title: string) => `Loading the sample "${title}"…`,
      loaded: (title: string, slotPhrase: string) => `Loaded the sample "${title}" as ${slotPhrase}.`,
      failed: "The sample could not be loaded. Try again, or choose a file of your own.",
    },
    consent: {
      sectionLabel: "Consent",
      label: "I have read how my document is handled, and I want to continue.",
    },
    continue: "Continue",
    /** While the files are on their way and being read: the button's label and the live note under it. */
    uploading: "Reading your document…",
    uploadingNote: "Your file is being sent to ClauseCompass and its text read. This usually takes a few seconds.",
    errors: {
      tooLarge: (size: string, limit: string) =>
        `This file is ${size}. The limit is ${limit}. Try a smaller file, or export the document as text.`,
      empty: "This file is empty (0 bytes). Check that it downloaded fully, then try again.",
      unsupported: (extension: string | null) =>
        extension
          ? `.${extension} files are not supported. Use a PDF, DOCX or TXT file.`
          : "This file type is not supported. Use a PDF, DOCX or TXT file.",
      legacyDoc: ".doc files are not supported. Open the file in Word and save it as .docx or PDF.",
      image:
        "This looks like a photo or a scan. ClauseCompass cannot read those yet; ask for the document as a text PDF, DOCX or TXT file.",
      mediaMismatch: (extension: string) =>
        `This file is named .${extension} but its contents are not a document. Use a PDF, DOCX or TXT file.`,
      multiple: "Drop one file at a time here.",
      unreadable: "This file could not be read. Try choosing it again.",
      missingDocument: "Choose a document to continue.",
      missingOlder: "Add the older version to continue.",
      missingNewer: "Add the newer version to continue.",
      consentRequired: "Confirm you have read how your document is handled to continue.",
    },
  };
