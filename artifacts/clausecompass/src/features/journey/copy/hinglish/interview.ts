import { minutesPhrase } from "./shared";

export const interview = {
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
  };
