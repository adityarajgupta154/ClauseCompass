import { minutesPhrase } from "./shared";

export const safety = {
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
  };
