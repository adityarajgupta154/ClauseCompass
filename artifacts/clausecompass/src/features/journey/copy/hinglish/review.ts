export const review = {
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
  };
