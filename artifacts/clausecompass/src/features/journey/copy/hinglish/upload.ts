import { MAX_FILE_LABEL } from "../../../document/constants";
import { minutesPhrase } from "./shared";

export const upload = {
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
  };
