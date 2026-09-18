import { minutesPhrase } from "./shared";

/** The FR-12 delete control and its outcomes; shown wherever a session exists. */
  export const session = {
    deleteNow: "Delete my document now",
    deleting: "Deleting…",
    note: (ttlMinutes: number) =>
      `Removes the document's text and everything prepared from it, from ClauseCompass and from this browser's memory. Without this, ClauseCompass deletes it ${minutesPhrase(ttlMinutes)} after your last action. Anything you have printed or downloaded stays with you.`,
    deleteFailed: (ttlMinutes: number) =>
      `ClauseCompass could not confirm the deletion just now. Try again in a moment; either way, the document is deleted ${minutesPhrase(ttlMinutes)} after your last action.`,
    /** Shown on the upload screen after the session ended on its own (the retention window passed while the reader was away). */
    expiredTitle: "Your session ended",
    expiredBody: (ttlMinutes: number) =>
      `${minutesPhrase(ttlMinutes)} passed without activity, so ClauseCompass deleted the document's text and everything prepared from it, as the notice below says it will. The files you chose are still here: press Continue to upload again.`,
    deletedTitle: "Your document has been deleted",
    deletedBody:
      "The document's text and everything prepared from it are gone from ClauseCompass and from this browser's memory; anything you printed or downloaded stays with you. To start again, pick your situation below and upload the document once more.",
  };
