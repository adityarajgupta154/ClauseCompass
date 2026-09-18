export const timeline = {
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
  };
