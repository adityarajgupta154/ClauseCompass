import { packet as englishPacket } from "../en/packet";

export const packet = {
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
    document: englishPacket.document,
    sections: englishPacket.sections,
    closing: englishPacket.closing,
  };
