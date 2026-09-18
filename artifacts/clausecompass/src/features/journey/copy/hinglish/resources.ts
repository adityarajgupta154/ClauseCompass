export const resources = {
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
      "/ask": "Apne sawaalon par wapas",
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
  };
