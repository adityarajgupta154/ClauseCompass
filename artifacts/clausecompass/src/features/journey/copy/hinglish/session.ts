import { minutesPhrase } from "./shared";

export const session = {
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
  };
