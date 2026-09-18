/**
   * The Preparation Packet (FR-09): the map, the dates, the review prompts
   * and a checklist of records, in one document made to be printed or saved
   * as a PDF. Everything here is exported, so it is product copy: the
   * responsible-language lint runs over this block in the tests.
   */
  export const packet = {
    heading: "Your preparation packet",
    lead: "Everything ClauseCompass prepared for this document, in one place you can print, save as a PDF or download as text: what it says, its dates, the questions to ask, the records to gather, and the exact wording behind each statement.",
    back: "Back to the review prompts",
    backToCompare: "Back to what changed",
    status: {
      analysing: (name: string) => `Reading ${name} and preparing the packet. This usually takes a few seconds.`,
      sent: (name: string) =>
        `This packet is built from the map and the review prompts prepared for ${name} in your session; the passages they rest on went to the AI model when those were prepared. ClauseCompass deletes the text and everything prepared from it when the session ends: when you delete it, or on its own after the time stated on the upload screen. Print or download the packet before then if you want to keep it; a copy you save is yours to keep or discard.`,
    },
    errors: {
      title: "The packet could not be prepared",
    },
    actions: {
      print: "Print or save as PDF",
      printHint: "Opens your browser's print dialog; choose \"Save as PDF\" there to keep a copy.",
      download: "Download as a text file",
      /** Keyboard bypass of the packet's many reference links, to the controls after it (the official-help link and the footer). */
      skipPast: "Skip past the packet",
      /** The bypass link's landing point, read out by a screen reader. */
      end: "End of the packet",
      /** File name for the text download; the document's own name keeps two packets apart. */
      fileName: (documentName: string) => `clausecompass-packet-${documentName}.txt`,
    },
    /** The exported page itself; every string below leaves the app on paper or in a file. */
    document: {
      title: "Preparation packet",
      subtitle: "Prepared with ClauseCompass, a plain-language reading aid.",
      /** One line under the title, so no page of the export is without the boundary. */
      notice: "Information, not legal advice. ClauseCompass explains what the document says and shows where it says so; it does not tell you whether a clause is legal or fair, and it does not replace a lawyer or a legal-aid service.",
      file: (name: string, summary: string) => `Document: ${name} (${summary})`,
      newerVersion: (name: string) => `Prepared from the newer version, ${name}.`,
      situation: (label: string) => `Situation: ${label}`,
      preparedOn: (date: string) => `Prepared on ${date}`,
      locale: "en-IN",
      /** How a numbered reference reads inline and in the list: "[3]". */
      reference: (number: number) => `[${number}]`,
      /** Read before an inline reference by a screen reader, so a link is "Reference [3]" rather than "[3]" alone. */
      referencePrefix: "Reference",
      /** Precedes the reference numbers of the places a clause was found: "Found at [5], [6]." */
      placesLabel: "Found at",
    },
    sections: {
      summary: {
        heading: "What the document says",
        lead: "The six points of the document map, in plain language. Each statement carries the number of the passage it rests on.",
      },
      dates: {
        heading: "Dates in this document",
        lead: "Every full date the document writes out, in order, with the sentence it appears in.",
      },
      questions: {
        heading: "Questions to ask",
        lead: "The review prompts for this moment. Put each question to the other side or to an adviser and note the answer next to it.",
        notFoundLead: "Clauses that often matter at this moment and that ClauseCompass looked for without finding. Ask about each one rather than assuming the document is silent:",
      },
      evidence: {
        heading: "Records to gather",
        lead: "What to have with you when you talk to a lawyer or a legal-aid service. Where a line comes from a clause in this document, the passage numbers follow it.",
        /** Every packet, whatever the moment or the clauses found. */
        always: [
          "The complete document, every page and annexure, as you received it or signed it.",
          "Any message, email or earlier draft in which the other side described these terms differently.",
        ],
        stage: {
          "before-signing": [
            "The answers you get to the questions above, with the date and the name of the person who gave each one.",
          ],
          "problem-started": [
            "A dated list of what happened, in order: what was said or sent, by whom, and on which day.",
            "Every notice, message or email about the problem, with proof of when it was sent or received.",
          ],
          "compare-versions": [
            "Both versions, each marked with the date you received it, and any message that announced the change.",
          ],
        },
        /** One line per clause family found in the document; the passages of that family's prompts follow it. */
        family: {
          money: "Receipts, bank statements or transfer records for every payment the document mentions: deposits, rent or fees, and any penalty already charged.",
          time: "Whatever fixes the dates: when you received the document, when it started, and any reminder or notice sent near a deadline.",
          duty: "Records of each duty being carried out or asked for: photographs, acknowledgements, messages.",
          exit: "Any notice of ending, its date, how it was delivered, and the proof of delivery.",
          "data-ip": "A note of what information was shared, with whom, and any permission you gave in writing.",
        },
      },
      citations: {
        heading: "The exact wording, by number",
        lead: "Every numbered reference above points to one of these passages, quoted exactly as the document has it.",
      },
    },
    /** Closes the export, after the boundary points. */
    closing:
      "This packet was prepared by software from the document's own wording and from a fixed set of checks. Use it to have a sharper conversation with a professional or an official legal-aid service such as NALSA or Tele Law; it does not replace that conversation.",
  };
