export const map = {
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
  };
