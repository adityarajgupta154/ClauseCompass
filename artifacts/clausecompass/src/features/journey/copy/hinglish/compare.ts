export const compare = {
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
  };
