import { MAX_FILE_LABEL } from "../document/constants";
import { en, type Copy } from "./copy.en";

/**
 * The Hinglish copy (FR-11): Hindi in Roman script, with the English words a
 * reader in India uses for these things (document, clause, notice, deposit,
 * legal aid) kept as they are. Same shape as the English table, enforced by
 * the `Copy` type; the meaning of every sentence follows its English line,
 * and the safety copy (the boundary, the retention notice, the safety
 * screen) makes exactly the same commitments in the same order.
 *
 * Three things are not translated, on purpose: the document's own wording
 * and the statements prepared from it (they are shown as they are, and the
 * language control says so), the preparation packet (it is prepared in
 * English so it can be handed to a lawyer or a legal-aid service as it is;
 * its sections point at the English table), and names (ClauseCompass, NALSA,
 * Tele Law, file types).
 */
/** "1 minute", "30 minute": Hinglish does not add an s. */
function minutesPhrase(minutes: number): string {
  return `${minutes} minute`;
}

export const hinglish: Copy = {
  product: {
    name: "ClauseCompass",
    tagline: "Legal documents ko aasan bhasha mein samajhne ka saathi.",
    motto: "Saaf documents. Behtar faisle.",
    intro:
      "Jo document aapko pareshan kar raha hai, use yahan laayein. ClauseCompass batata hai ki usmein kya likha hai, aasan bhasha mein; dikhata hai ki woh baat document mein kahan likhi hai; aur lawyer ya legal-aid service se baat karne ki taiyari mein madad karta hai.",
    description:
      "Apna legal document aasan bhasha mein: kaun se clauses aur dates matter karte hain, kya poochna hai, lawyer ke liye source-cited packet. Jaankari, legal advice nahi.",
  },
  boundary: {
    title: "Jaankari, legal advice nahi",
    points: [
      "ClauseCompass batata hai ki document mein kya likha hai aur woh exact wording dikhata hai jahan se baat aayi hai. Yeh nahi batata ki koi clause legal ya fair hai, koi vivaad kaise khatam hoga, ya aapka haq kya hai.",
      "Yeh lawyer nahi hai aur lawyer ki jagah nahi leta. Jo yeh taiyar karta hai, usse kisi professional ya NALSA, Tele Law jaisi official legal-aid service se zyada saaf baat kar paayein.",
      "Jab koi baat document mein nahi hoti, yeh andaza lagane ke bajaye \"is document mein nahi mila\" kehta hai.",
    ],
    notes: {
      papers: "Wahi documents. Saaf kal.",
      aside: "Saaf jaankari. Zyada bharosa.",
    },
  },
  welcome: {
    beginEyebrow: "Yahan se shuru karein",
    closingLine: "Wahi documents. Saaf kal.",
    heading: "Aaj aap kis wajah se yahan aaye hain?",
    lead: "Aap jis mod par hain, use chunein. Isse tay hota hai ki analysis pehle kaun se clause aur tareekhein dekhega.",
    chooseLabel: "Apni situation chunein",
    earlierChoice: "Aapki pehle ki choice",
    introductionLabel: "Parichay",
    stageArt: {
      contract: "Contract",
      notice: "Notice",
      old: "Purana",
      new: "Naya",
    },
    stageAside: {
      words: ["Clauses", "Log", "Sambhavnayein"],
      paper: "Saaf jaankari se behtar kal shuru hota hai.",
    },
    helpPoints: {
      sources: { title: "Sirf official sources", line: "Official legal-aid sevaaon aur helplines ke links." },
      checked: { title: "Aakhri check ki tareekh", line: "Har listing kab aakhri baar check hui, yeh saath likha hai." },
      upload: { title: "Upload ki zaroorat nahi", line: "Yahan koi document upload kiye bina contact details dekhein." },
    },
    helpAside: {
      note: "Aaj ki madad, behtar kal ke liye.",
    },
    hero: {
      eyebrow: "Aapke documents. Saaf samajh.",
      learnMore: "Aur jaanein",
      features: {
        plain: "Aasan bhasha mein samjhaish",
        source: "Document ki asli wording",
        prepared: "Behtar taiyari",
      },
      notes: {
        first: "Mushkil documents. Seedhe jawab.",
        second: "Aaj samjhein. Kal tay karein.",
      },
      cardLead: "Is clause ka matlab…",
    },
  },
  stages: {
    "before-signing": {
      label: "Sign karne se pehle",
      description:
        "Offer letter, rent agreement, NDA ya loan, jis par aapse sign maanga gaya hai. Dekhein ki document ke mutabik aap kis baat par raazi ho rahe hain, aur sign karne se pehle kya poochhna chahiye.",
      example: "Jaise: pehli job ka offer, ya client ka bheja hua NDA.",
    },
    "problem-started": {
      label: "Koi problem shuru ho gayi hai",
      description:
        "Pehle se sign kiye agreement par koi vivaad, notice ya chhoota hua payment. Woh wording dhoondhein jo is baare mein hai, aur jo hua uski tareekh-war timeline banayein.",
      example: "Jaise: landlord ka ghar khaali karne ka message, ya deposit jo wapas nahi aaya.",
    },
    "compare-versions": {
      label: "Do versions compare karein",
      description:
        "Terms, policy ya contract ka purana aur naya version. Dekhein ki clause-dar-clause kya badla, aasan bhasha mein.",
      example: "Jaise: subscription ke badle hue terms, ya renewal jismein rent ya fees badal gayi.",
    },
  },
  display: {
    label: "Settings",
    language: {
      label: "Bhasha",
      english: "English",
      hinglish: "Hinglish",
    },
    convenience:
      "Hinglish sirf samajhne ki suvidha ke liye hai, authoritative version nahi. Document ki apni wording, aur usse taiyar ki gayi har statement, bina anuvaad ke waise hi dikhti hai jaise hai; packet English mein banta hai.",
    textSize: {
      label: "Text ka size",
      smaller: "Chhota text",
      larger: "Bada text",
      percent: (percent: number) => `${percent}%`,
      status: (percent: number) => `Text ka size ${percent}%`,
    },
    theme: {
      label: "Theme",
      light: "Light",
      dark: "Dark",
      system: "Device jaisa",
    },
    links: {
      help: "Help aur support",
      feedback: "Feedback dein",
      about: "ClauseCompass ke baare mein",
    },
  },
  readAloud: {
    start: "Padh kar sunao",
    stop: "Padhna rokein",
    unavailable: "Is browser mein speech shuru nahi ho saki. Shayad iski voices band hain ya install nahi hain.",
    whole: {
      map: "Poora map padh kar sunao",
      review: "Saare prompts padh kar sunao",
    },
  },
  upload: {
    heading: "Apna document upload karein",
    headingCompare: "Dono versions upload karein",
    lead: `PDF, DOCX ya TXT file, zyada se zyada ${MAX_FILE_LABEL}. Scan aur photo abhi padhe nahi ja sakte, isliye agar aapke paas sirf wahi hai to text version maang lein.`,
    leadCompare:
      `Purana aur naya version, har ek PDF, DOCX ya TXT file, zyada se zyada ${MAX_FILE_LABEL}. Scan aur photo abhi padhe nahi ja sakte.`,
    situationLabel: "Aapki situation",
    change: "Situation badlein",
    art: {
      label: "Contract",
      note: "Aapka document yahan",
      noteCompare: "Dono versions yahan",
    },
    aside: {
      left: "Wahi documents. Saaf jawab.",
      right: "Upload karein. Samjhein. Taiyaar rahein.",
      paper: "Saaf jaankari se behtar kal shuru hota hai.",
    },
    notice: {
      title: "Upload se pehle: aapke document ke saath kya hota hai",
      points: (ttlMinutes: number | null) => [
        "Jab tak aap Continue nahi dabate, kuch bhi aapke browser se bahar nahi jaata. File chunne se woh sirf yahin, aapke device par padhi jaati hai.",
        `Continue dabane par ClauseCompass document ka text padhta hai aur woh text sirf is session ke liye rakhta hai: file khud store nahi hoti. Woh text ${
          ttlMinutes === null ? "aapke aakhri action ke thodi der baad apne aap" : `aapke aakhri action ke ${minutesPhrase(ttlMinutes)} baad apne aap`
        } delete ho jaata hai, aur aap use kabhi bhi khud delete kar sakte hain.`,
        "Document ko aasan bhasha mein samjhane ke liye uske kuch hisse ek AI service ko bheje jaate hain; poori file nahi. ClauseCompass aapke document se kabhi kuch train nahi karta.",
      ],
    },
    documentsHeadingCompare: "Dono versions",
    slots: {
      primary: "Aapka document",
      older: "Purana version",
      newer: "Naya version",
    },
    slotPhrases: {
      primary: "aapka document",
      older: "purana version",
      newer: "naya version",
    },
    dropzone: {
      prompt: "File yahan drag karein, ya",
      action: "File chunein",
      hint: `PDF, DOCX ya TXT, zyada se zyada ${MAX_FILE_LABEL}.`,
      replace: "Badlein",
      remove: "Hataayein",
      readyLabel: "Taiyar",
    },
    samples: {
      heading: "Koi document paas nahi? Ek sample try karein",
      lead: "Testing ke liye likhe gaye chaar kaalpanik documents; aakhri wala rental agreement ka badla hua draft hai, versions compare karne ke liye. Inmein har naam, rakam aur tareekh kaalpanik hai.",
      use: "Yeh sample use karein",
      loading: (title: string) => `Sample "${title}" load ho raha hai…`,
      loaded: (title: string, slotPhrase: string) => `Sample "${title}" ${slotPhrase} ke taur par load ho gaya.`,
      failed: "Sample load nahi ho saka. Phir se try karein, ya apni koi file chunein.",
    },
    consent: {
      sectionLabel: "Sehmati",
      label: "Maine padh liya hai ki mere document ke saath kya hota hai, aur main aage badhna chahta/chahti hoon.",
    },
    continue: "Continue",
    uploading: "Aapka document padha ja raha hai…",
    uploadingNote: "Aapki file ClauseCompass ko bheji ja rahi hai aur uska text padha ja raha hai. Ismein aam taur par kuch second lagte hain.",
    errors: {
      tooLarge: (size: string, limit: string) =>
        `Yeh file ${size} ki hai. Limit ${limit} hai. Chhoti file try karein, ya document ko text ke roop mein export karein.`,
      empty: "Yeh file khaali hai (0 bytes). Check karein ki woh poori download hui thi, phir se try karein.",
      unsupported: (extension: string | null) =>
        extension
          ? `.${extension} files support nahi hoti. PDF, DOCX ya TXT file use karein.`
          : "Is tarah ki file support nahi hoti. PDF, DOCX ya TXT file use karein.",
      legacyDoc: ".doc files support nahi hoti. File ko Word mein kholkar .docx ya PDF ke roop mein save karein.",
      image:
        "Yeh photo ya scan lag raha hai. ClauseCompass inhe abhi padh nahi sakta; document ko text PDF, DOCX ya TXT file ke roop mein maang lein.",
      mediaMismatch: (extension: string) =>
        `Is file ka naam .${extension} hai, par iske andar document nahi hai. PDF, DOCX ya TXT file use karein.`,
      multiple: "Yahan ek baar mein ek hi file daalein.",
      unreadable: "Yeh file padhi nahi ja saki. Use phir se chun kar try karein.",
      missingDocument: "Aage badhne ke liye ek document chunein.",
      missingOlder: "Aage badhne ke liye purana version add karein.",
      missingNewer: "Aage badhne ke liye naya version add karein.",
      consentRequired: "Aage badhne ke liye confirm karein ki aapne padh liya hai ki aapke document ke saath kya hota hai.",
    },
  },
  interview: {
    heading: "Agla step: kuch chhote sawaal",
    placeholder: (ttlMinutes: number) =>
      `Sawaalon wala baaki step aage banaya ja raha hai. ClauseCompass ne aapke document ka text padh liya hai aur use is session ke liye rakha hai: yeh aapke aakhri action ke ${minutesPhrase(ttlMinutes)} baad, ya neeche "Mera document abhi delete karein" dabate hi, delete ho jaata hai. Abhi tak kisi AI model ko kuch nahi gaya hai.`,
    documentsLabel: "Analysis ke liye taiyar",
    back: "Upload par wapas",
    continueToMap: "Document map par aage badhein",
    continueNote: (documentPhrase: string) =>
      `Ise dabane par ${documentPhrase} ke kuch hisse map taiyar karne ke liye AI model ko bheje jaate hain.`,
    goToCompare: "Ya seedha dekhein ki versions ke beech kya badla",
    goToCompareNote: "Ise dabane par ClauseCompass dono versions ko aamne-saamne rakhta hai. Is step mein koi AI model shaamil nahi hai.",
    situation: {
      label: "Document se pehle: kya aapki situation ke baare mein kuch pehle batana hai?",
      hint: "Optional. Apne shabdon mein ek-do vaakya, English ya Hinglish mein. ClauseCompass inhe yahin, aapke browser mein padhta hai, yeh tay karne ke liye ki agli screen kaun si hogi: agar inmein kisi insaan ko nuksaan ka zikr hai, to document se pehle official help aati hai. Yeh shabd na ClauseCompass ko bheje jaate hain, na kisi AI model ko, aur is screen se jaate hi rakhe nahi jaate.",
      samples: {
        heading: "Ek sample jawaab try karein",
        lead: "Demo ke liye likhe gaye: inmein se koi bhi kisi asli insaan ke shabd nahi hain. Ek chunne se box bhar jaata hai; Continue dabane tak kuch nahi hota.",
        use: "Yeh jawaab use karein",
        loaded: (title: string) => `Sample jawaab “${title}” box mein hai. Aage badhne ke liye Continue dabayein.`,
      },
    },
  },
  safety: {
    heading: "Aapki suraksha sabse pehle",
    categories: {
      danger: {
        heading: "Agar aap abhi khatre mein hain",
        body: "Aapne dhamki ya hinsa ke baare mein likha hai. Aisa saamne aane par ClauseCompass yahin ruk jaata hai: police aur emergency services is par kaam kar sakti hain, aur document intezaar kar sakta hai.",
      },
      coercion: {
        heading: "Agar koi aapko majboor kar raha hai ya rok kar rakha hai",
        body: "Aapne likha hai ki aapko kisi baat ke liye majboor kiya, roka ya dhamkaya ja raha hai. Aisa saamne aane par ClauseCompass yahin ruk jaata hai: police aur emergency services is par kaam kar sakti hain, aur document intezaar kar sakta hai.",
      },
      "child-safety": {
        heading: "Agar koi bachcha khatre mein hai",
        body: "Aapne ek aise bachche ke baare mein likha hai jo khatre mein ho sakta hai. Aisa saamne aane par ClauseCompass yahin ruk jaata hai: Child Helpline aur emergency services is par kaam kar sakti hain, aur document intezaar kar sakta hai.",
      },
      "self-harm": {
        heading: "Agar aap apni jaan lene ke baare mein soch rahe hain",
        body: "Aapne likha hai ki aap jeena nahi chahte. Agar abhi aap aisa mehsoos kar rahe hain, to kisi se baat karna kisi bhi document se pehle aata hai: neeche di gayi helpline free hai aur ek counsellor jawaab deta hai, aur emergency number bhi yahin hai.",
      },
    },
    call: (number: string) => `${number} par call karein`,
    why: {
      heading: "Yeh screen aapko kyun dikh rahi hai",
      body: "ClauseCompass ne aapka jawaab yahin, aapke browser mein padha, aur usmein kisi insaan ko nuksaan ka zikr tha. Yeh use kisi bhi document se pehle maanta hai, isliye analysis par aage nahi badha. Aapne jo type kiya woh kahin nahi bheja gaya, aur woh shabd rakhe nahi gaye.",
      mismatch: "Agar yeh aapki situation nahi hai, to aap neeche se shuru se dobara shuru kar sakte hain; document ko ek baar phir upload karna hoga.",
    },
    routes: {
      heading: "Kaun is par kaam kar sakta hai",
      more: "Suraksha ke liye saari official help, free legal aid samet",
    },
    document: {
      heading: "Aapka document",
      notAnalysed: "ClauseCompass ne yahan se iska analysis nahi kiya hai aur nahi karega.",
      deleting: "Is session ke liye padha gaya text delete kiya ja raha hai, uske saath usse taiyar ki gayi har cheez bhi.",
      deleted: "Is session ke liye padha gaya text delete ho gaya hai, uske saath usse taiyar ki gayi har cheez bhi.",
      unconfirmed: (ttlMinutes: number) =>
        `ClauseCompass ne is session ke liye padhe gaye text ko delete karne ko kaha, par abhi iski pushti nahi kar saka. Server use aapke aakhri action ke ${minutesPhrase(ttlMinutes)} baad apne aap delete kar deta hai, aur is beech kisi cheez ka analysis nahi hota.`,
    },
    startOver: "Shuru se dobara shuru karein",
  },
  analysis: {
    documentSummary: (kind: string, paragraphs: number, pages: number | null) =>
      `${kind.toUpperCase()} · ${paragraphs} paragraph${pages === null ? "" : ` · ${pages} page`}`,
    fileNames: (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} aur ${names[names.length - 1]}`),
    errors: {
      generic: "ClauseCompass tak pahunchne mein kuch gadbad ho gayi. Thodi der mein phir se try karein.",
      offline: "ClauseCompass tak pahuncha nahi ja saka. Thodi der mein phir se try karein.",
      retry: "Phir se try karein",
      uploadAgain: "Document phir se upload karein",
    },
  },
  session: {
    deleteNow: "Mera document abhi delete karein",
    deleting: "Delete ho raha hai…",
    note: (ttlMinutes: number) =>
      `Document ka text aur usse taiyar ki gayi har cheez hata deta hai, ClauseCompass se bhi aur is browser ki memory se bhi. Iske bina, ClauseCompass use aapke aakhri action ke ${minutesPhrase(ttlMinutes)} baad delete kar deta hai. Jo aapne print ya download kiya hai, woh aapke paas rehta hai.`,
    deleteFailed: (ttlMinutes: number) =>
      `ClauseCompass abhi deletion ki pushti nahi kar saka. Thodi der mein phir se try karein; waise bhi document aapke aakhri action ke ${minutesPhrase(ttlMinutes)} baad delete ho jaata hai.`,
    expiredTitle: "Aapka session khatam ho gaya",
    expiredBody: (ttlMinutes: number) =>
      `${minutesPhrase(ttlMinutes)} tak koi activity nahi hui, isliye ClauseCompass ne document ka text aur usse taiyar ki gayi har cheez delete kar di, jaisa neeche ka notice kehta hai. Aapki chuni hui files abhi bhi yahan hain: phir se upload karne ke liye Continue dabayein.`,
    deletedTitle: "Aapka document delete ho gaya hai",
    deletedBody:
      "Document ka text aur usse taiyar ki gayi har cheez ClauseCompass se aur is browser ki memory se hat gayi hai; jo aapne print ya download kiya, woh aapke paas rehta hai. Dobara shuru karne ke liye neeche apni situation chunein aur document ek baar phir upload karein.",
  },
  map: {
    heading: "Aapka document map",
    lead: "Chheh points par document kya kehta hai, aasan bhasha mein. Har statement woh exact wording dikhata hai jis par woh tika hai; jab koi point document mein nahi hota, to yeh saaf keh deta hai.",
    back: "Sawaalon par wapas",
    continueToReview: "Review prompts par aage badhein",
    status: {
      analysing: (name: string) => `${name} padha ja raha hai aur map taiyar ho raha hai. Ismein aam taur par kuch second lagte hain.`,
      sent: (name: string) =>
        `Yeh map aapke session mein rakhe ${name} ke text se taiyar hua; jin hisson par yeh tika hai woh AI model ko bheje gaye the. Session khatam hone par ClauseCompass woh text aur yeh map delete kar deta hai: jab aap use delete karein, ya upload screen par bataye samay ke baad apne aap.`,
    },
    errors: {
      title: "Map taiyar nahi ho saka",
    },
    fields: {
      parties: {
        title: "Is se kaun bandha hai",
        description: "Document ke pakshkaar (parties) aur har ek ki bhoomika.",
        missing: "party ya bhoomika ki wording",
      },
      dates: {
        title: "Yeh kitne samay tak chalta hai",
        description: "Kab shuru aur kab khatam hota hai, deadlines, aur renewal ya extension ke liye kya chahiye.",
        missing: "term, deadline ya renewal ki wording",
      },
      money: {
        title: "Paisa",
        description: "Kya dena hai, kab, deposit aur woh kaise wapas aata hai, aur koi fee ya penalty.",
        missing: "payment, deposit ya penalty ki wording",
      },
      duties: {
        title: "Zimmedaariyan aur paabandiyan",
        description: "Har paksh ko kya karna hai, kya nahi karna hai, aur kya ek paksh akela tay kar sakta hai.",
        missing: "zimmedaari ya paabandi ki wording",
      },
      termination: {
        title: "Yeh kaise khatam ho sakta hai",
        description: "Kaun ise khatam kar sakta hai, kitne notice ke saath, koi lock-in, aur khatam hone par kya hota hai.",
        missing: "notice, termination ya lock-in ki wording",
      },
      dispute: {
        title: "Agar vivaad ho",
        description: "Kaun sa kanoon lagta hai, kaun si adaalat ya authority faisla karti hai, aur kya ismein arbitration ka intezaam hai.",
        missing: "governing law, jurisdiction ya vivaad ki wording",
      },
    },
    notFound: {
      title: "Is document mein nahi mila",
      body: (missing: string) =>
        `ClauseCompass ne ${missing} dhoondhi aur kuch nahi mila. Ho sakta hai document is baare mein aise shabdon mein kehta ho jo yeh pehchaanta nahi, isliye agar aap ise yahan ummeed kar rahe the, to document ko chup maanne ke bajaye is baare mein poochhein.`,
    },
    wordingOnly: {
      title: "Document ke apne shabdon mein dikhaya gaya",
      reasons: {
        "model-unavailable":
          "Aasan bhasha mein samjhane wali service uplabdh nahi thi, isliye ClauseCompass ne jo hisse dhoondhe woh bilkul waise hi dikhaye gaye hain jaise likhe hain.",
        "nothing-verified":
          "Aasan bhasha ke kisi bhi rephrasing ko document se verify nahi kiya ja saka, isliye ClauseCompass ne jo hisse dhoondhe woh bilkul waise hi dikhaye gaye hain jaise likhe hain.",
      },
    },
    withheld: (count: number) =>
      count === 1
        ? "1 aur statement rok liya gaya kyunki use document se verify nahi kiya ja saka."
        : `${count} aur statements rok liye gaye kyunki unhe document se verify nahi kiya ja saka.`,
    topics: {
      parties: "Parties",
      date: "Tareekh",
      term: "Avadhi (term)",
      renewal: "Renewal",
      deadline: "Deadline",
      payment: "Payment",
      deposit: "Deposit",
      penalty: "Late fee ya penalty",
      bond: "Bond ya repayment",
      discretionary: "Ek paksh ki marzi par",
      charges: "Kaun kya deta hai",
      "non-compete": "Non-compete",
      "non-solicit": "Non-solicit",
      restriction: "Paabandi",
      "one-sided": "Ek-tarfa shart",
      upkeep: "Rakh-rakhaav",
      hours: "Kaam ke ghante",
      "one-way": "Ek-tarfa zimmedaari",
      condition: "Shart",
      notice: "Notice period",
      "notice-service": "Notice kaise diya jaata hai",
      termination: "Termination",
      "lock-in": "Lock-in ya minimum period",
      handover: "Khatam hone par",
      dispute: "Vivaad",
    } as Record<string, string>,
  },
  timeline: {
    heading: "Is document ki tareekhein",
    lead: "Document mein poori likhi har tareekh, kram se, us vaakya ke saath jismein woh aati hai. \"Har mahine ki 5 tareekh\" jaise baar-baar aane wale din Paisa ke neeche hain, yahan nahi.",
    empty: {
      title: "Is document mein koi poori tareekh nahi mili",
      body: "Document mein koi poori tareekh (din, mahina aur saal) likhi nahi hai. \"Gyarah mahine\" jaisi avadhiyan \"Yeh kitne samay tak chalta hai\" ke neeche hain.",
    },
    asWritten: (text: string) => `Likha hai "${text}"`,
    ambiguity: {
      "day-month-order": (alternative: string) =>
        `${alternative} bhi ho sakta hai: document yeh nahi batata ki kaun sa number din hai aur kaun sa mahina.`,
      "two-digit-year": "Saal do ankon mein likha hai aur use 20xx saal ke roop mein padha gaya hai.",
    },
    ambiguityCheck: "Is par bharosa karne se pehle check karein.",
    ambiguityLabel: "Anishchit tareekh",
    topicsLabel: "Is se bhi juda hai",
    locale: "en-IN",
  },
  review: {
    heading: "Aapke review prompts",
    lead: "Is document ke woh clause jo is mod par dhyan se dekhne laayak hain, har ek ke saath woh sawaal jo doosre paksh ya kisi adviser se poochha jaaye. Har prompt woh wording dikhata hai jis par woh tika hai.",
    back: "Document map par wapas",
    status: {
      analysing: (name: string) => `${name} padha ja raha hai aur review prompts taiyar ho rahe hain. Ismein aam taur par kuch second lagte hain.`,
      sent: (name: string) =>
        `Yeh prompts aapke session mein rakhe ${name} ke text se taiyar hue; jin hisson par yeh tike hain woh AI model ko bheje gaye the. Session khatam hone par ClauseCompass woh text aur yeh prompts delete kar deta hai: jab aap use delete karein, ya upload screen par bataye samay ke baad apne aap.`,
    },
    errors: {
      title: "Review prompts taiyar nahi ho sake",
    },
    continueToCompare: "Kya badla, us par aage badhein",
    continueToPacket: "Apne preparation packet par aage badhein",
    groups: {
      primary: {
        title: "Pehle check karein",
        description: "Woh clause jo is mod par sabse zyada maayne rakhte hain. Har ek ko padhein aur faisla karne se pehle sawaal poochhein.",
      },
      secondary: {
        title: "Yeh bhi check karne laayak",
        description: "Woh clause jo aam taur par abhi kam maayne rakhte hain, par is document mein hain.",
      },
      background: {
        title: "Baaki mile hue clause",
        description: "Document mein mile; har ek ka prompt us tarah ke clause ka standard check hai.",
      },
    },
    family: {
      money: "Paisa",
      time: "Tareekhein aur avadhi",
      duty: "Zimmedaariyan aur paabandiyan",
      exit: "Khatam hona aur vivaad",
      "data-ip": "Jaankari aur data",
    },
    card: {
      topic: "Vishay:",
      places: (count: number) => (count === 1 ? "1 jagah mila" : `${count} jagah mila`),
      showMorePlaces: (count: number) => (count === 1 ? "1 aur jagah dikhao" : `${count} aur jagah dikhao`),
      showFewerPlaces: "Kam jagahein dikhao",
      showParagraph: "Paragraph dikhao",
      hideParagraph: "Paragraph chhupao",
      template: {
        title: "Is tarah ke clause ka standard check",
        reasons: {
          "model-unavailable":
            "Aasan bhasha mein samjhane wali service uplabdh nahi thi, isliye yeh prompt is document ke liye likha hua nahi, balki is tarah ke clause ka standard prompt hai.",
          "nothing-verified":
            "Is clause ki aasan bhasha wali rephrasing document se verify nahi ho saki, isliye uski jagah is tarah ke clause ka standard prompt hai.",
          "not-asked":
            "Yeh clause is mod par aage rehne wale clauses mein nahi hai, isliye ise rephrasing ke liye nahi bheja gaya; yeh prompt is tarah ke clause ka standard prompt hai.",
        },
      },
    },
    withheld: (count: number) =>
      count === 1
        ? "1 rephrasing rok li gayi kyunki use us clause se verify nahi kiya ja saka jiske liye woh likhi gayi thi; uski jagah standard prompt dikhaya gaya hai."
        : `${count} rephrasings rok li gayin kyunki unhe un clauses se verify nahi kiya ja saka jinke liye woh likhi gayi thin; har jagah standard prompt dikhaya gaya hai.`,
    notFound: {
      title: "Is document mein nahi mila",
      description:
        "Woh clause jo is mod par aksar maayne rakhte hain aur jinhe ClauseCompass ne dhoondha par paaya nahi. Ho sakta hai document inke baare mein aise shabdon mein kehta ho jo yeh pehchaanta nahi, isliye agar aap kisi ki ummeed kar rahe the, to document ko chup maanne ke bajaye us baare mein poochhein.",
    },
    empty: {
      title: "Is document ke liye koi review prompt nahi",
      body: "ClauseCompass jo clause dhoondhta hai unmein se koi nahi mila. Iska matlab yeh nahi ki poochhne ko kuch nahi hai; iska matlab hai ki document aise shabd istemaal karta hai jo yeh pehchaanta nahi. Ise kisi adviser ke saath padhein.",
    },
  },
  compare: {
    heading: "Versions ke beech kya badla",
    lead: "Naye version ka har paragraph purane ke saamne rakha gaya hai. Jahan wording alag hai, wahan dono versions aamne-saamne dikhte hain aur badle hue shabd mark kiye gaye hain; har badlaav is hisaab se chhaanta gaya hai ki woh kis cheez ko chhoota hai: paisa, samay, zimmedaariyan, upaay (remedies), ya sirf wording.",
    back: "Review prompts par wapas",
    status: {
      analysing: (names: string) => `${names} padhe ja rahe hain aur dono versions aamne-saamne rakhe ja rahe hain. Ismein aam taur par kuch second lagte hain.`,
      sent: (names: string) =>
        `Dono versions aapke session mein rakhe ${names} ke text se aamne-saamne rakhe gaye. Is comparison mein koi AI model shaamil nahi hai. Session khatam hone par ClauseCompass woh text aur yeh comparison delete kar deta hai: jab aap use delete karein, ya upload screen par bataye samay ke baad apne aap.`,
    },
    errors: {
      title: "Versions compare nahi ho sake",
    },
    summary: {
      title: "Sankshep mein",
      changes: (count: number) => (count === 1 ? "1 badlaav" : `${count} badlaav`),
      unchanged: (count: number) => (count === 1 ? "1 paragraph same" : `${count} paragraph same`),
      added: (count: number) => (count === 1 ? "1 paragraph joda gaya" : `${count} paragraph jode gaye`),
      removed: (count: number) => (count === 1 ? "1 paragraph hataya gaya" : `${count} paragraph hataye gaye`),
      byKind: (label: string, count: number) => `${label}: ${count}`,
    },
    kinds: {
      money: {
        label: "Paisa",
        check: "Yeh kisi rakam, fee ya percentage ko chhoota hai. Aankdon ko us se milaayein jo tay hua tha, aur dekhein ki document mein kuch aur to inse nahi nikaala gaya.",
      },
      time: {
        label: "Samay",
        check: "Yeh kisi tareekh, avadhi ya deadline ko chhoota hai. Samjhein ki naya version aapko kya deta hai ya kya le leta hai, aur kab tak.",
      },
      duty: {
        label: "Zimmedaariyan",
        check: "Yeh is baat ko chhoota hai ki kise kya karna hai, ya kya karne ki ijaazat hai. Dekhein ki nayi wording kis paksh ko baandhti hai, aur kya koi permission ya consent wala step hat gaya hai.",
      },
      remedy: {
        label: "Upaay (remedies)",
        check: "Yeh us baat ko chhoota hai jo kuch galat hone par hota hai: khatam karne, kaatne, zabt karne ya claim karne ka adhikaar. Maanne se pehle naye version mein iska nateeja poora padhein.",
      },
      wording: {
        label: "Wording",
        check: "Shabd alag hain, par ClauseCompass jo rakam, tareekhein, zimmedaariyan ya upaay dhoondhta hai unmein se kuch nahi badla. Ek baar padh kar dekhein ki matlab wahi hai ya nahi.",
      },
    },
    statuses: {
      changed: "Badla",
      added: "Naye version mein joda gaya",
      removed: "Naye version mein hataya gaya",
    },
    card: {
      kind: "Badlaav kis mein:",
      older: "Purana version",
      newer: "Naya version",
      notInOlder: "Yeh paragraph purane version mein nahi hai.",
      notInNewer: "Yeh paragraph naye version mein nahi hai.",
      removedWord: "hataya gaya:",
      addedWord: "joda gaya:",
      keyTerms: "Mukhya shabd",
      terms: (side: string, terms: string[]) => `${side}: ${terms.join(", ")}`,
      alsoTouches: (labels: string[]) => `${labels.join(", ")} ko bhi chhoota hai.`,
    },
    empty: {
      title: "Koi antar nahi mila",
      body: "Dono files paragraph-dar-paragraph ek jaisi padhi gayin, sirf capital letters aur quote marks ka farak chhod kar. Agar aap badlaav ki ummeed kar rahe the, to check karein ki yeh wahi do versions hain jinhe aap compare karna chahte the.",
    },
    note: "Paragraphs kram se milaaye jaate hain, isliye jo clause document mein doosri jagah chala gaya woh ek baar hataya gaya aur ek baar joda gaya dikhega. Chhantai badle hue shabdon se hoti hai, poora clause padh kar nahi; ise pehli nazar maanein, aur har card poora padhein.",
    continueToPacket: "Apne preparation packet par aage badhein",
  },
  packet: {
    heading: "Aapka preparation packet",
    lead: "Is document ke liye ClauseCompass ne jo kuch taiyar kiya, ek jagah, jise aap print kar sakte hain, PDF ke roop mein save kar sakte hain ya text mein download kar sakte hain: document kya kehta hai, uski tareekhein, poochhne laayak sawaal, jutaane laayak records, aur har statement ke peeche ki exact wording. Packet English mein banta hai; yeh setting sirf screen ki bhasha badalti hai.",
    back: "Review prompts par wapas",
    backToCompare: "Kya badla, us par wapas",
    status: {
      analysing: (name: string) => `${name} padha ja raha hai aur packet taiyar ho raha hai. Ismein aam taur par kuch second lagte hain.`,
      sent: (name: string) =>
        `Yeh packet aapke session mein ${name} ke liye taiyar kiye gaye map aur review prompts se bana hai; jin hisson par yeh tike hain woh unhe taiyar karte samay AI model ko gaye the. Session khatam hone par ClauseCompass woh text aur usse taiyar ki gayi har cheez delete kar deta hai: jab aap use delete karein, ya upload screen par bataye samay ke baad apne aap. Agar packet rakhna hai to usse pehle print ya download kar lein; save ki hui copy aapki hai, rakhein ya hataayein.`,
    },
    errors: {
      title: "Packet taiyar nahi ho saka",
    },
    actions: {
      print: "Print karein ya PDF mein save karein",
      printHint: "Aapke browser ka print dialog khulta hai; copy rakhne ke liye wahan \"Save as PDF\" chunein.",
      download: "Text file mein download karein",
      skipPast: "Packet ke aage jaayein",
      end: "Packet ka ant",
      fileName: (documentName: string) => `clausecompass-packet-${documentName}.txt`,
    },
    // The exported page is prepared in English whatever the reader's language; see the note at the top of this file.
    document: en.packet.document,
    sections: en.packet.sections,
    closing: en.packet.closing,
  },
  resources: {
    heading: "Official help jinse aap sampark kar sakte hain",
    description:
      "Bharat ki sarkari helplines aur legal-aid sevaayein: har ek kya karti hai, kaise sampark karein. Sirf jaankari; ClauseCompass inse juda nahi hai.",
    lead: "Bharat mein sarkar dwara chalayi jaane wali sevaayein jo legal jaankari aur salah deti hain, shikayat leti hain, ya emergency mein jawaab deti hain. ClauseCompass inki list isliye deta hai taaki aapko pata ho kahan jaana hai. Yeh inmein se kisi se juda nahi hai, aapke liye inse sampark nahi kar sakta, aur yeh tay nahi karta ki koi seva aapki situation par lagoo hoti hai ya nahi: yeh us seva ko hi batana hai.",
    backTo: {
      "/": "Shuruaat par wapas",
      "/upload": "Apne upload par wapas",
      "/interview": "Sawaalon par wapas",
      "/map": "Document map par wapas",
      "/review": "Review prompts par wapas",
      "/compare": "Kya badla, us par wapas",
      "/packet": "Apne packet par wapas",
      "/safety": "Suraksha screen par wapas",
    } as Record<string, string>,
    back: "Wapas",
    concernLegend: "Yeh kis baare mein hai?",
    concernHint: "Chunne se neeche di gayi sevaon ki list badalti hai. Yeh sahi sevaayein jaldi dhoondhne ka ek tareeka bhar hai, isse zyada kuch nahi; koi seva aapka maamla le sakti hai ya nahi, yeh us seva ko hi batana hai.",
    concerns: {
      "legal-advice": {
        label: "Legal advice, ya free legal aid",
        description: "Sign ya jawaab dene se pehle kisi lawyer se baat karna, ya yeh pata karna ki free legal aid aapke liye khuli hai ya nahi.",
      },
      rent: {
        label: "Rent, deposit ya eviction",
        description: "Landlord ya tenant, deposit jo wapas nahi aaya, ya ghar khaali karne ka notice.",
      },
      work: {
        label: "Salary, notice period ya workplace",
        description: "Employer, ruki hui salary, notice period, ya kaam ki jagah par harassment.",
      },
      consumer: {
        label: "Koi khareed, seva ya refund",
        description: "Koi cheez jiske aapne paise diye par woh mili nahi, kharab thi, ya refund nahi hua.",
      },
      cyber: {
        label: "Online fraud ya cyber crime",
        description: "Fake app, website ya call se liye gaye paise, ya online durvyavahaar.",
      },
      safety: {
        label: "Koi khatre mein hai ya majboor kiya ja raha hai",
        description: "Dhamki, hinsa, zabardasti liya gaya sign ya payment, ya kisi bachche ko nuksaan.",
      },
    },
    showing: (count: number, label: string) => (count === 1 ? `“${label}” ke liye 1 seva` : `“${label}” ke liye ${count} sevaayein`),
    emergency: "Turant emergency mein, Bharat mein kisi bhi phone se police, fire aur ambulance ke liye number 112 hai.",
    linksNote: "Links naye tab mein khulte hain, taaki yahan jo aapne taiyar kiya woh khula rahe. Phone number aapke phone ka dialler kholte hain.",
    card: {
      runBy: "Kaun chalata hai",
      whoItIsFor: "Kiske liye hai",
      howToReach: "Kaise sampark karein",
      hours: "Samay",
      opensInNewTab: "naye tab mein khulta hai",
      lastChecked: (date: string) => `Aakhri baar ${date} ko check kiya gaya`,
      source: "Srot:",
      confirm: "Uplabdhta aur patrata (eligibility) seedha seva se confirm karein.",
    },
    entry: {
      footer: "Official help jinse aap sampark kar sakte hain",
      packet: "Aage: official help jinse aap sampark kar sakte hain",
      welcomeHeading: "Abhi kisi seva tak pahunchna hai?",
      welcomeLine: "Official legal-aid sevaayein aur helplines, har ek ke saath woh tareekh jab use aakhri baar check kiya gaya. Na document chahiye, na upload.",
      welcomeLink: "Official help dekhein",
    },
  },
  sourceCard: {
    show: (count: number) => (count > 1 ? `Source dikhao (${count})` : "Source dikhao"),
    hide: (count: number) => (count > 1 ? `Source chhupao (${count})` : "Source chhupao"),
    excerptLabel: "Document ki exact wording, jaisi likhi hai (anuvaad nahi)",
    moreLocations: (count: number) => (count === 1 ? "aur 1 jagah" : `aur ${count} jagah`),
    lowConfidence: "Document se kamzor match. Is par bharosa karne se pehle source ki wording padhein.",
    unresolved: (count: number) =>
      count === 1
        ? "1 aur cited hissa is document mein nahi mila aur dikhaya nahi gaya hai."
        : `${count} aur cited hisse is document mein nahi mile aur dikhaye nahi gaye hain.`,
    location: {
      clause: (label: string) => `Clause ${label}`,
      page: (page: number) => `Page ${page}`,
      paragraph: (index: number) => `paragraph ${index}`,
      paragraphOnly: (index: number) => `Paragraph ${index}`,
      separator: " · ",
    },
    fallback: {
      title: "Nahi dikhaya gaya: aapke document mein verified source nahi",
      reasons: {
        "no-citations": "Yeh statement aapke document ke kisi hisse ki taraf ishaara nahi karta tha.",
        "unresolved-citations":
          "Yeh statement jin hisson ki taraf ishaara karta tha, unhe aapke document se milaya nahi ja saka.",
        "invalid-claim": "Yeh statement aise roop mein aaya jise ClauseCompass check nahi kar saka.",
      },
      why: "ClauseCompass sirf woh statements dikhata hai jinhe woh aapke document ki apni wording tak trace kar sake, isliye yeh bina verify kiye dikhane ke bajaye rok liya gaya.",
    },
  },
  footer: {
    line: "ClauseCompass jaankari deta hai, legal advice nahi.",
    helpLabel: "Sarkari madad",
    helpLead: "Official legal-aid sevaayein aur helplines dhoondhein. Har listing mein likha hai ki use aakhri baar kab check kiya gaya. Na document chahiye, na upload.",
    asideNote: "Zyada log. Sabke liye fair kal.",
    cardNote: "Jaankari se fair faislon mein madad.",
    compassPoints: ["N", "E", "S", "W"],
  },
  auth: {
    signIn: {
      modes: {
        signIn: {
          eyebrow: "ClauseCompass mein swagat hai",
          heading: "Apna document kholne ke liye sign in karein",
          lead: "ClauseCompass document usi account ke liye kholta hai jisse use upload kiya gaya, isliye use jaanna hota hai ki aapka account kaun sa hai. Google account ya email aur password, dono chalenge.",
        },
        create: {
          eyebrow: "Apna account banayein",
          heading: "Saaf samajh",
          accent: "yahin se shuru hoti hai.",
          lead: "Account se ClauseCompass ek reader ke documents ko doosre ke documents se alag pehchanta hai. Email aur password se ek banayein, ya apne Google account se aage badhein.",
        },
        reset: {
          eyebrow: "Password bhool gaye?",
          heading: "Email par reset link paayein",
          lead: "Apne account ka email address likhein. Reset email mein naya password chunne ka link aayega; uske baad yahan pehle ki tarah sign in karein.",
        },
      },
      points: {
        signIn: [
          { title: "Aapke documents, aapke account ke neeche", line: "Har document usi account ke liye khulta hai jisse use upload kiya gaya." },
          { title: "Saral, saaf padhai", line: "Har clause aasan shabdon mein, saath mein uska source text." },
          { title: "Aam logon ke liye bana", line: "Aasan bhasha. Behtar faisle." },
        ],
        create: [
          { title: "Ek account, aapke documents", line: "Isi se ClauseCompass aapke documents ko kisi aur reader ke documents se alag pehchanta hai." },
          { title: "Saaf explanations", line: "Har clause ke liye aasan shabd, saath mein source text." },
          { title: "Sirf kuch samay ke liye rakha jaata hai", line: "Document tab khatam hota hai jab aap use delete karein, ya jab retention window beet jaaye." },
        ],
      },
      google: "Google se aage badhein",
      or: "ya email se",
      email: "Email",
      emailPlaceholder: "aap@example.com",
      password: "Password",
      passwordPlaceholder: { signIn: "Apna password likhein", create: "Ek password banayein" },
      passwordHint: "Kam se kam 6 characters.",
      showPassword: "Password dikhayein",
      hidePassword: "Password chhupayein",
      submit: { signIn: "Sign in karein", create: "Account banayein", reset: "Reset email bhejein" },
      working: "Ek pal…",
      toCreate: "Naye hain? Account banayein",
      toSignIn: { question: "Pehle se account hai?", action: "Sign in karein" },
      toSignInFromReset: "Sign in par wapas jaayein",
      toReset: "Password bhool gaye?",
      resetSent: (email: string) => `${email} par reset email bheja gaya hai. Uska link kholkar naya password chunein, phir yahan sign in karein.`,
      note: "Sign in karne se document kitne samay tak rakha jaata hai, yeh nahi badalta. Document aur usse taiyar ki gayi har cheez tab bhi khatam hoti hai jab aap use delete karein, ya jab retention window beet jaaye; account bas itna batata hai ki woh aapke hain.",
      back: "Shuruaat par wapas jaayein",
      done: "Sign in ho gaya. Aapko aapke document tak le ja rahe hain…",
    },
    header: {
      signIn: "Sign in",
      signOut: "Sign out",
      signedInAs: (name: string) => `${name} ke roop mein sign in`,
      signingOut: "Sign out ho raha hai…",
    },
    errors: {
      emailRequired: "Apne account ka email address likhein.",
      passwordRequired: "Apna password likhein.",
      "popup-blocked": "Browser ne Google sign-in window rok di. Is page ke liye pop-ups allow karein, ClauseCompass ko alag tab mein kholein, ya email se sign in karein.",
      "popup-closed": "Google sign-in window poori hone se pehle band ho gayi. Jab taiyar hon, phir se try karein.",
      "unauthorized-domain": "ClauseCompass ke is address par Google sign-in abhi chalu nahi hai. Email se sign in karein, ya baad mein phir try karein.",
      "provider-off": "Sign in karne ka yeh tareeka ClauseCompass ke liye abhi chalu nahi hai. Doosra tareeka try karein.",
      "wrong-password": "Yeh email aur password yahan kisi account se mel nahi khaate. Dono check karke phir try karein, ya password reset karein.",
      "no-account": "Is email se abhi koi account nahi hai. Email check karein, ya account banayein.",
      "email-in-use": "Is email se account pehle se hai. Sign in karein, ya password reset karein.",
      "weak-password": "Thoda lamba password chunein: kam se kam 6 characters.",
      "bad-email": "Yeh email address jaisa nahi lagta. Check karke phir try karein.",
      "too-many": "Lagataar bahut baar try ho gaya. Kuch minute rukein, phir try karein.",
      disabled: "Yeh account disable kar diya gaya hai. Agar yeh anpekshit hai, to ClauseCompass ki is copy ko chalane waale se sampark karein.",
      offline: "Sign-in Google tak nahi pahunch saka. Apna connection check karke phir try karein.",
      "not-configured": "ClauseCompass ki is copy par sign-in set up nahi hai. Ise chalane waale ko sign-in configuration jodni hogi.",
      unknown: "Sign-in poora nahi hua. Thodi der mein phir try karein.",
    },
  },
  notFoundPage: {
    heading: "Page nahi mila",
    body: "Aap jo page dhoondh rahe hain woh maujood nahi hai ya hata diya gaya hai.",
    returnHome: "Shuruaat par wapas",
  },
  skipToContent: "Seedha content par jaayein",
  loadingScreen: "Agli screen khul rahi hai…",
};
