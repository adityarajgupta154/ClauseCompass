/**
 * The English copy: every sentence the product says, so that none is inline
 * in a component. Components read it through `copy` (copy.ts), which follows
 * the reader's language; the Hinglish table (copy.hinglish.ts) has the same
 * shape, enforced by the `Copy` type, so a sentence cannot exist in one
 * language and be missing in the other. Add a key here first.
 *
 * The boundary statement and the retention notice are safety copy: they must
 * stay factual about what the product does and does not do. Do not soften or
 * embellish them for tone, and do not promise behaviour the code does not have.
 * Whoever changes one of them changes its Hinglish line in the same commit.
 */
import { MAX_FILE_LABEL } from "../document/constants";

/** "1 minute", "30 minutes": the retention window as a phrase. */
export function minutesPhrase(minutes: number): string {
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

/** One of the three points beside the sign-in form: a title and one line. */
export type SignInPoint = { title: string; line: string };

export const en = {
  product: {
    name: "ClauseCompass",
    tagline: "Plain-language navigation for legal documents.",
    /** The line under the wordmark in the site header. */
    motto: "Plainer documents. Brighter decisions.",
    intro:
      "Bring the document that is worrying you. ClauseCompass explains what it says in plain language, shows you where it says that, and helps you prepare for a conversation with a lawyer or a legal-aid service.",
    /** What a search result or a shared link says about the product (the description in the page head, at most 160 characters). */
    description:
      "A legal document in plain language: the clauses and dates that matter, questions to ask, and a source-cited packet for a lawyer. Information, not legal advice.",
  },
  boundary: {
    title: "Information, not legal advice",
    points: [
      "ClauseCompass explains what a document says and points to the exact wording it came from. It does not tell you whether a clause is legal or fair, predict how a dispute will end, or decide what you are entitled to.",
      "It is not a lawyer and does not replace one. Use what it prepares to have a sharper conversation with a professional or an official legal-aid service such as NALSA or Tele Law.",
      "When something is not in the document, it says \"not found in this document\" instead of guessing.",
    ],
    /** Two handwritten notes in the decoration beside the statement on a wide screen; the statement above says everything that matters. */
    notes: {
      papers: "Same documents. A clearer tomorrow.",
      aside: "Clear information. More confidence.",
    },
  },
  welcome: {
    /** The small line over the heading of the choice, and the one under the three cards. */
    beginEyebrow: "Start here",
    closingLine: "Same documents. A clearer tomorrow.",
    heading: "What brings you here today?",
    lead: "Pick the moment you are in. It decides which clauses and dates the analysis looks at first.",
    chooseLabel: "Choose your situation",
    earlierChoice: "Your earlier choice",
    introductionLabel: "Introduction",
    /** The labels drawn on the documents in the pictures on the three cards (decorative; the card's words carry the meaning). */
    stageArt: {
      contract: "Contract",
      notice: "Notice",
      old: "Old",
      new: "New",
    },
    /** The decoration beside the choice on a wide screen: three words in the margin and a line typed on a sheet of paper. */
    stageAside: {
      words: ["Clauses", "People", "Possibilities"],
      paper: "A fairer tomorrow begins with clearer information.",
    },
    /** The three short points beside the way to official help, and the handwritten line in the margin next to it on a wide screen. */
    helpPoints: {
      sources: { title: "Official sources", line: "Links to official legal-aid services and helplines." },
      checked: { title: "Last-checked dates", line: "Know when each listing was last checked." },
      upload: { title: "No upload needed", line: "See the contact details without uploading a document here." },
    },
    helpAside: {
      note: "Help today for a fairer tomorrow.",
    },
    /** The banner at the top of the welcome screen; the notes and the card lead sit inside the decorative picture. */
    hero: {
      eyebrow: "Your documents. Clearer understanding.",
      learnMore: "Learn more",
      features: {
        plain: "Plain explanations",
        source: "Exact source text",
        prepared: "Be better prepared",
      },
      notes: {
        first: "Complex documents. Simpler answers.",
        second: "Understand today. Decide tomorrow.",
      },
      cardLead: "This clause means…",
    },
  },
  /**
   * The life moments (PRD §5 step 1), by the stage id the rule engine keys on
   * (stages.ts). `example` is shown to the reader, so it must read as their
   * situation, never as an internal persona name.
   */
  stages: {
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
  },
  /**
   * The settings menu in the header of every screen (FR-11): the language of
   * the product's own words, the size of the text, the theme, and the way to
   * the help, feedback and about pages. Only the product's words change with
   * the language; the document's wording and the plain-language statements
   * prepared from it stay as they are, and `convenience` says so wherever
   * Hinglish is showing.
   */
  display: {
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
  },
  /**
   * Read-aloud (FR-11) with the browser's own speech, so nothing leaves the
   * device. It reads the plain-language statements and the prompts, never
   * anything withheld.
   */
  readAloud: {
    start: "Read aloud",
    stop: "Stop reading",
    unavailable: "This browser could not start speech. Its voices may be switched off or not installed.",
    whole: {
      map: "Read the whole map aloud",
      review: "Read all the prompts aloud",
    },
  },
  upload: {
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
  },
  interview: {
    heading: "Next: a few quick questions",
    /** Where the document is now (FR-12): read into the session, not yet shown to any AI model. */
    placeholder: (ttlMinutes: number) =>
      `The rest of the questions step is being built next. ClauseCompass has read your document's text and keeps it for this session: it is deleted ${minutesPhrase(ttlMinutes)} after your last action, or as soon as you press "Delete my document now" below. Nothing has gone to an AI model yet.`,
    documentsLabel: "Ready to analyse",
    back: "Back to upload",
    continueToMap: "Continue to the document map",
    /** The AI model sees passages for the first time on the next screen; say so here, where the button is. */
    continueNote: (documentPhrase: string) =>
      `Pressing this sends passages of ${documentPhrase} to the AI model to prepare the map.`,
    /** The compare stage only: straight to the change cards, skipping the newer version's map and prompts. */
    goToCompare: "Or go straight to what changed between the versions",
    goToCompareNote: "Pressing this lines up the two versions on ClauseCompass. No AI model is involved in that step.",
    /**
     * The one open question asked before any analysis (PRD §5 step 3, §8):
     * whatever the reader types is scanned in the browser for a mention of
     * harm to a person, and that decides whether the next screen is the
     * document map or the safety screen. The hint states exactly what the
     * code does with the words: read here, never sent, not kept.
     */
    situation: {
      label: "Before the document: is there anything about your situation to say first?",
      hint: "Optional. A sentence or two in your own words, in English or Hinglish. ClauseCompass reads it here, in your browser, to decide which screen comes next: when it mentions harm to a person, official help comes before the document. The words are not sent to ClauseCompass or to any AI model, and they are not kept when you leave this screen.",
      /** Synthetic answers from samples/interview-answers.json, so the safety screen can be reached in a demo without anyone typing a real crisis. */
      samples: {
        heading: "Try a sample answer",
        lead: "Written for the demo: none of them is a real person's words. Choosing one fills the box; nothing happens until you press Continue.",
        use: "Use this answer",
        loaded: (title: string) => `The sample answer “${title}” is in the box. Press Continue to go on.`,
      },
    },
  },
  /**
   * The safety screen (PRD §8, the escalation branch): shown when the
   * reader's own words mention a threat or violence, being forced or held, a
   * child at risk, or not wanting to live. Every number and service name on
   * it comes from the resource registry (FR-10); this copy only frames them.
   * It says what the code did — read the words here, stopped short of the
   * analysis, deleted the session — and offers no way to carry on with the
   * document, only a way to start again from the beginning.
   */
  safety: {
    heading: "Your safety comes first",
    /** Per escalation category: the heading of the emergency panel and the sentence under it. */
    categories: {
      danger: {
        heading: "If you are in danger now",
        body: "You wrote about a threat or violence. ClauseCompass stops here when that comes up: the police and the emergency services can act on it, and a document can wait.",
      },
      coercion: {
        heading: "If someone is forcing or holding you",
        body: "You wrote about being forced, held or threatened into something. ClauseCompass stops here when that comes up: the police and the emergency services can act on it, and a document can wait.",
      },
      "child-safety": {
        heading: "If a child is at risk",
        body: "You wrote about a child who may be at risk. ClauseCompass stops here when that comes up: the Child Helpline and the emergency services can act on it, and a document can wait.",
      },
      "self-harm": {
        heading: "If you are thinking of ending your life",
        body: "You wrote about not wanting to live. If that is how you feel right now, talking to someone comes before any document: the helpline below is free and answered by a counsellor, and the emergency number is there too.",
      },
    },
    call: (number: string) => `Call ${number}`,
    why: {
      heading: "Why you are seeing this",
      /** No quote-back of the reader's words: the sentence above names what was read in general terms, and the words themselves are not kept. */
      body: "ClauseCompass read your answer here, in your browser, and it mentioned harm to a person. It treats that as coming before any document, so it did not go on to the analysis. Nothing you typed was sent anywhere, and the words were not kept.",
      mismatch: "If this does not describe your situation, you can start again from the beginning below; the document would need to be uploaded once more.",
    },
    routes: {
      heading: "Who can act on this",
      more: "All official help for safety, including free legal aid",
    },
    document: {
      heading: "Your document",
      notAnalysed: "ClauseCompass has not analysed it from here and will not.",
      /** By what the server has answered about the session's deletion; the screen never claims more than it knows. */
      deleting: "The text it had read for this session is being deleted, along with anything prepared from it.",
      deleted: "The text it had read for this session has been deleted, along with anything prepared from it.",
      unconfirmed: (ttlMinutes: number) =>
        `ClauseCompass asked for the text it had read for this session to be deleted, but could not confirm that just now. The server deletes it on its own ${minutesPhrase(ttlMinutes)} after your last action, and nothing is analysed in the meantime.`,
    },
    startOver: "Start again from the beginning",
  },
  /** Shared by every analysis screen (map, review prompts): the request either way is the same file, posted once. */
  analysis: {
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
  },
  /** The FR-12 delete control and its outcomes; shown wherever a session exists. */
  session: {
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
  },
  /** The Document Map (FR-04) and the date timeline (FR-05). */
  map: {
    heading: "Your document map",
    lead: "What the document says on six points, in plain language. Every statement shows the exact wording it rests on; when a point is not in the document, it says so.",
    back: "Back to the questions",
    continueToReview: "Continue to the review prompts",
    /**
     * Status copy (FR-12): factual about where the document is. Its text
     * sits in the session on ClauseCompass, passages of it went to the AI
     * model for this output, and both go when the session ends: on the
     * delete control, or on its own after the session's idle limit.
     */
    status: {
      analysing: (name: string) => `Reading ${name} and preparing the map. This usually takes a few seconds.`,
      sent: (name: string) =>
        `This map was prepared from the text of ${name} held in your session; the passages it rests on were sent to the AI model. ClauseCompass deletes that text and this map when the session ends: when you delete it, or on its own after the time stated on the upload screen.`,
    },
    errors: {
      title: "The map could not be prepared",
    },
    fields: {
      parties: {
        title: "Who is bound by it",
        description: "The parties to the document and the role each one plays.",
        missing: "party or role wording",
      },
      dates: {
        title: "How long it lasts",
        description: "When it starts and ends, deadlines, and what a renewal or extension needs.",
        missing: "term, deadline or renewal wording",
      },
      money: {
        title: "Money",
        description: "What has to be paid, when, deposits and how they come back, and any fee or penalty.",
        missing: "payment, deposit or penalty wording",
      },
      duties: {
        title: "Duties and restrictions",
        description: "What each side must do, must not do, and what one side may decide alone.",
        missing: "duty or restriction wording",
      },
      termination: {
        title: "How it can end",
        description: "Who can end it, with how much notice, any lock-in, and what happens on ending.",
        missing: "notice, termination or lock-in wording",
      },
      dispute: {
        title: "If there is a dispute",
        description: "Which law applies, which courts or authority decide, and whether it provides for arbitration.",
        missing: "governing-law, jurisdiction or dispute wording",
      },
    },
    notFound: {
      title: "Not found in this document",
      body: (missing: string) =>
        `ClauseCompass looked for ${missing} and found none. The document may still cover this in words it does not recognise, so if you expected it here, ask about it rather than assuming the document is silent.`,
    },
    wordingOnly: {
      title: "Shown in the document's own words",
      reasons: {
        "model-unavailable":
          "The plain-language rephrasing service was unavailable, so the passages ClauseCompass located are shown exactly as written instead.",
        "nothing-verified":
          "None of the plain-language rephrasings could be verified against the document, so the passages ClauseCompass located are shown exactly as written instead.",
      },
    },
    withheld: (count: number) =>
      count === 1
        ? "1 further statement was withheld because it could not be verified against the document."
        : `${count} further statements were withheld because they could not be verified against the document.`,
    /** Category keys are the rule registry's; the labels are the reader's. */
    topics: {
      parties: "Parties",
      date: "Date",
      term: "Term",
      renewal: "Renewal",
      deadline: "Deadline",
      payment: "Payment",
      deposit: "Deposit",
      penalty: "Late fee or penalty",
      bond: "Bond or repayment",
      discretionary: "At one side's discretion",
      charges: "Who pays what",
      "non-compete": "Non-compete",
      "non-solicit": "Non-solicit",
      restriction: "Restriction",
      "one-sided": "One-sided term",
      upkeep: "Upkeep",
      hours: "Working hours",
      "one-way": "One-way obligation",
      condition: "Condition",
      notice: "Notice period",
      "notice-service": "How notice is given",
      termination: "Termination",
      "lock-in": "Lock-in or minimum period",
      handover: "On ending",
      dispute: "Dispute",
    } as Record<string, string>,
  },
  timeline: {
    heading: "Dates in this document",
    lead: "Every full date the document writes out, in order, with the sentence it appears in. Recurring days such as \"the 5th of every month\" are under Money, not here.",
    empty: {
      title: "No full dates found in this document",
      body: "The document does not write out any complete date (day, month and year). Periods such as \"eleven months\" are under How long it lasts.",
    },
    asWritten: (text: string) => `Written as "${text}"`,
    ambiguity: {
      "day-month-order": (alternative: string) =>
        `Could also mean ${alternative}: the document does not say which number is the day and which the month.`,
      "two-digit-year": "The year is written with two digits and is read as a 20xx year.",
    },
    ambiguityCheck: "Check before relying on it.",
    ambiguityLabel: "Uncertain date",
    topicsLabel: "Also relevant to",
    locale: "en-IN",
  },
  /** The citation primitive (SourceCard) and its withheld state. */
  /**
   * The Review Prompts screen (FR-06). Every sentence here is a product
   * sentence, so the responsible-language lint runs over this block in the
   * tests: name the wording, ask the reader to check it, never conclude.
   */
  review: {
    heading: "Your review prompts",
    lead: "The clauses in this document that are worth a closer look at this moment, each with the question to put to the other side or to an adviser. Every prompt shows the wording it rests on.",
    back: "Back to the document map",
    status: {
      analysing: (name: string) => `Reading ${name} and preparing the review prompts. This usually takes a few seconds.`,
      sent: (name: string) =>
        `These prompts were prepared from the text of ${name} held in your session; the passages they rest on were sent to the AI model. ClauseCompass deletes that text and these prompts when the session ends: when you delete it, or on its own after the time stated on the upload screen.`,
    },
    errors: {
      title: "The review prompts could not be prepared",
    },
    continueToCompare: "Continue to what changed",
    continueToPacket: "Continue to your preparation packet",
    groups: {
      primary: {
        title: "Check first",
        description: "The clauses that matter most at this moment. Read each one and ask the question before you decide.",
      },
      secondary: {
        title: "Also worth checking",
        description: "Clauses that usually matter less right now but are in this document.",
      },
      background: {
        title: "Other clauses found",
        description: "Found in the document; the prompt for each is the standard check for that kind of clause.",
      },
    },
    family: {
      money: "Money",
      time: "Dates and duration",
      duty: "Duties and restrictions",
      exit: "Ending and disputes",
      "data-ip": "Information and data",
    },
    card: {
      /** Read before the family name by screen readers, so the badge is announced as "Topic: Money". */
      topic: "Topic:",
      places: (count: number) => (count === 1 ? "Found in 1 place" : `Found in ${count} places`),
      showMorePlaces: (count: number) => (count === 1 ? "Show 1 more place" : `Show ${count} more places`),
      showFewerPlaces: "Show fewer places",
      showParagraph: "Show the paragraph",
      hideParagraph: "Hide the paragraph",
      template: {
        title: "Standard check for this kind of clause",
        reasons: {
          "model-unavailable":
            "The plain-language rephrasing service was unavailable, so this prompt is the standard one for this kind of clause rather than one written for this document.",
          "nothing-verified":
            "The plain-language rephrasing for this clause could not be verified against the document, so this prompt is the standard one for this kind of clause instead.",
          "not-asked":
            "This clause is not among the ones that lead at this moment, so it was not sent for rephrasing; this prompt is the standard one for this kind of clause.",
        },
      },
    },
    withheld: (count: number) =>
      count === 1
        ? "1 rephrasing was withheld because it could not be verified against the clause it was written for; the standard prompt is shown in its place."
        : `${count} rephrasings were withheld because they could not be verified against the clause they were written for; the standard prompt is shown in each place.`,
    notFound: {
      title: "Not found in this document",
      description:
        "Clauses that often matter at this moment and that ClauseCompass looked for without finding. The document may still cover them in words it does not recognise, so if you expected one, ask about it rather than assuming the document is silent.",
    },
    empty: {
      title: "No review prompts for this document",
      body: "ClauseCompass found none of the clauses it looks for. That does not mean there is nothing to ask about; it means the document uses words it does not recognise. Read it with an adviser.",
    },
  },
  /** The two-version comparison (FR-07): change cards, one per paragraph that differs. */
  compare: {
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
  },
  /**
   * The Preparation Packet (FR-09): the map, the dates, the review prompts
   * and a checklist of records, in one document made to be printed or saved
   * as a PDF. Everything here is exported, so it is product copy: the
   * responsible-language lint runs over this block in the tests.
   */
  packet: {
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
  },
  /**
   * Official help (FR-10): the reviewed registry in data/resources, shown by
   * the reader's concern. What each service is and how to reach it is data
   * (lib/resources), so this block is only what the screen says around the
   * cards. Two lines are safety copy and read exactly as written: `card.confirm`
   * is on every card, and `lead` says ClauseCompass is connected to none of
   * these services. The responsible-language lint runs over this block in the
   * tests; the concern descriptions describe situations, never what the
   * reader is owed or should do.
   */
  resources: {
    heading: "Official help you can contact",
    /** What a search result says about the help screen, the one other screen open to search engines. */
    description:
      "Government-run helplines and legal-aid services in India, what each does and how to reach it. For information; ClauseCompass is not connected to any of them.",
    lead: "Government-run services in India that give legal information and advice, take complaints, or answer in an emergency. ClauseCompass lists them so that you know where to turn. It is not connected to any of them, cannot contact them for you, and does not decide whether a service applies to your situation: that is for the service to say.",
    /** The back link names where the reader came from when the app knows it. */
    backTo: {
      "/": "Back to the start",
      "/upload": "Back to your upload",
      "/interview": "Back to the questions",
      "/map": "Back to the document map",
      "/review": "Back to the review prompts",
      "/compare": "Back to what changed",
      "/packet": "Back to your packet",
      "/safety": "Back to the safety screen",
    } as Record<string, string>,
    back: "Back",
    concernLegend: "What is this about?",
    concernHint: "Choosing changes which services are listed below. It is a way to find the right ones sooner, nothing more; whether a service can take up your matter is for that service to say.",
    concerns: {
      "legal-advice": {
        label: "Legal advice, or free legal aid",
        description: "Talking to a lawyer before signing or replying, or finding out whether free legal aid is open to you.",
      },
      rent: {
        label: "Rent, deposit or eviction",
        description: "A landlord or a tenant, a deposit that has not come back, or a notice to leave.",
      },
      work: {
        label: "Salary, notice period or the workplace",
        description: "An employer, unpaid salary, a notice period, or harassment at work.",
      },
      consumer: {
        label: "A purchase, a service or a refund",
        description: "Something you paid for that was not delivered, was faulty, or was not refunded.",
      },
      cyber: {
        label: "Online fraud or a cyber crime",
        description: "Money taken through a fake app, website or call, or abuse online.",
      },
      safety: {
        label: "Someone is in danger or being forced",
        description: "Threats, violence, a signature or a payment taken by force, or harm to a child.",
      },
    },
    showing: (count: number, label: string) => (count === 1 ? `1 service for “${label}”` : `${count} services for “${label}”`),
    /** Above the safety list only. A number, not an instruction. */
    emergency: "In an immediate emergency, 112 is the number for police, fire and ambulance from any phone in India.",
    linksNote: "Links open in a new tab, so anything you have prepared here stays open. Phone numbers open your phone's dialler.",
    card: {
      runBy: "Run by",
      whoItIsFor: "Who it is for",
      howToReach: "How to reach it",
      hours: "Hours",
      opensInNewTab: "opens in a new tab",
      lastChecked: (date: string) => `Last checked ${date}`,
      source: "Source:",
      confirm: "Confirm availability and eligibility with the service directly.",
    },
    /** Where the screen is linked from. */
    entry: {
      footer: "Official help you can contact",
      packet: "Next: official help you can contact",
      welcomeHeading: "Need to reach a service now?",
      welcomeLine: "Official legal-aid services and helplines, each with the date it was last checked. No document or upload needed.",
      welcomeLink: "See official help",
    },
  },
  sourceCard: {
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
  },
  footer: {
    line: "ClauseCompass gives information, not legal advice.",
    helpLabel: "Official help",
    /** Under the footer's heading, which is the help link's own text. */
    helpLead: "Find official legal-aid services and helplines. Each listing shows when it was last checked. No document or upload is needed.",
    /** Decorative, wide screens only: a handwritten line beside the olive branch in the footer's left margin. */
    asideNote: "More people. Fairer tomorrows.",
    /** Decorative, wide screens only: the words set on the top card of the stack in the footer's right margin. */
    cardNote: "Information supports fairer decisions.",
    /** The cardinal letters on the compass rose in the footer's right margin, clockwise from the top. */
    compassPoints: ["N", "E", "S", "W"],
  },
  /** Sign-in (the API opens a document for one signed-in reader): the screen, the header control, and what can go wrong. */
  auth: {
    signIn: {
      /**
       * The screen's words by what the form is set to do: sign in, create an
       * account, or reset a password. `accent` is the end of the one heading,
       * set in the accent colour; the heading reads as one sentence.
       */
      modes: {
        signIn: {
          eyebrow: "Welcome to ClauseCompass",
          heading: "Sign in to open your document",
          lead: "ClauseCompass opens a document for the account that uploaded it, so it needs to know which account is yours. A Google account or an email and password will do.",
        },
        create: {
          eyebrow: "Create your account",
          heading: "A clearer understanding",
          accent: "starts here.",
          lead: "An account is how ClauseCompass tells one reader's documents from another's. Create one with an email and a password, or continue with your Google account.",
        },
        reset: {
          eyebrow: "Forgot your password?",
          heading: "Get a reset link by email",
          lead: "Enter the email address of your account. A reset email brings a link to choose a new password; afterwards, sign in here as before.",
        },
      },
      /**
       * Three short points beside the form (the reset form keeps the sign-in
       * points); three exactly, as the screen has an icon for each. Nothing
       * here promises safety or security; each line is something the product
       * does: a document opens for its own account, and ends when the reader
       * deletes it or the retention window passes.
       */
      points: {
        signIn: [
          { title: "Your documents, under your account", line: "Each opens for the account that uploaded it." },
          { title: "A simpler, clearer read", line: "Each clause in plain words, with its source text beside it." },
          { title: "Built for everyday people", line: "Plain language. Brighter decisions." },
        ] as [SignInPoint, SignInPoint, SignInPoint],
        create: [
          { title: "One account, your documents", line: "It is how ClauseCompass tells your documents from another reader's." },
          { title: "Clear explanations", line: "Plain words for every clause, with the source text beside them." },
          { title: "Kept only for a while", line: "A document ends when you delete it, or when the retention window passes." },
        ] as [SignInPoint, SignInPoint, SignInPoint],
      },
      google: "Continue with Google",
      or: "or with email",
      email: "Email",
      emailPlaceholder: "you@example.com",
      password: "Password",
      passwordPlaceholder: { signIn: "Enter your password", create: "Create a password" },
      passwordHint: "At least 6 characters.",
      /** The control at the end of the password field; its name says what pressing it does. */
      showPassword: "Show password",
      hidePassword: "Hide password",
      /** The one button under the form, by what the form is set to do. */
      submit: { signIn: "Sign in", create: "Create account", reset: "Send reset email" },
      working: "One moment…",
      /** Links that change what the form does; the way back from the create form is a question and its answer. */
      toCreate: "New here? Create an account",
      toSignIn: { question: "Already have an account?", action: "Sign in" },
      toSignInFromReset: "Back to sign in",
      toReset: "Forgot your password?",
      resetSent: (email: string) => `A reset email is on its way to ${email}. Open its link to choose a new password, then sign in here.`,
      /** What signing in does not change (FR-12): how long a document is kept. It still ends when the reader says, or when the window passes. */
      note: "Signing in does not change how long a document is kept. The document and everything prepared from it still end when you delete them, or when the retention window passes; the account only marks them as yours.",
      back: "Back to start",
      /** After a successful sign-in, while the next screen loads. */
      done: "Signed in. Taking you to your document…",
    },
    header: {
      signIn: "Sign in",
      signOut: "Sign out",
      signedInAs: (name: string) => `Signed in as ${name}`,
      signingOut: "Signing out…",
    },
    errors: {
      emailRequired: "Enter the email address of your account.",
      passwordRequired: "Enter your password.",
      "popup-blocked": "The browser blocked the Google sign-in window. Allow pop-ups for this page, open ClauseCompass in its own tab, or sign in with email instead.",
      "popup-closed": "The Google sign-in window was closed before it finished. Try again when you are ready.",
      "unauthorized-domain": "Google sign-in is not enabled for this address of ClauseCompass yet. Sign in with email, or try again later.",
      "provider-off": "This way of signing in is not enabled for ClauseCompass yet. Try the other one.",
      "wrong-password": "That email and password do not match an account here. Check them and try again, or reset your password.",
      "no-account": "There is no account with that email yet. Check it, or create an account.",
      "email-in-use": "An account with that email already exists. Sign in instead, or reset your password.",
      "weak-password": "Choose a longer password: at least 6 characters.",
      "bad-email": "That does not look like an email address. Check it and try again.",
      "too-many": "Too many attempts in a row. Wait a few minutes, then try again.",
      disabled: "This account has been disabled. If that is unexpected, contact whoever runs this copy of ClauseCompass.",
      offline: "Sign-in could not reach Google. Check your connection and try again.",
      "not-configured": "Sign-in is not set up on this copy of ClauseCompass. Whoever runs it needs to add the sign-in configuration.",
      unknown: "Sign-in did not go through. Try again in a moment.",
    },
  },
  notFoundPage: {
    heading: "Page not found",
    body: "The page you're looking for doesn't exist or has been moved.",
    returnHome: "Return to start",
  },
  skipToContent: "Skip to content",
  /** The one line shown while a screen's code is fetched (a moment, on a slow connection). */
  loadingScreen: "Opening the next screen…",
};

/** The shape every language table has. */
export type Copy = typeof en;
