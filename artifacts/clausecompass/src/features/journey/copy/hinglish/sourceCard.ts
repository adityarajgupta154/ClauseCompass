export const sourceCard = {
    show: (count: number) => (count > 1 ? `Source dikhao (${count})` : "Source dikhao"),
    hide: (count: number) => (count > 1 ? `Source chhupao (${count})` : "Source chhupao"),
    excerptLabel: "Document ki exact wording, jaisi likhi hai (anuvaad nahi)",
    moreLocations: (count: number) => (count === 1 ? "aur 1 jagah" : `aur ${count} jagah`),
    lowConfidence: "Document se kamzor match. Is par bharosa karne se pehle source ki wording padhein.",
    unresolved: (count: number) =>
      count === 1
        ? "1 aur cited hissa is document mein nahi mila aur dikhaya nahi gaya hai."
        : `${count} aur cited hisse is document mein nahi mile aur dikhaye nahi gaye hain.`,
    location: {
      clause: (label: string) => `Clause ${label}`,
      page: (page: number) => `Page ${page}`,
      paragraph: (index: number) => `paragraph ${index}`,
      paragraphOnly: (index: number) => `Paragraph ${index}`,
      separator: " · ",
    },
    fallback: {
      title: "Nahi dikhaya gaya: aapke document mein verified source nahi",
      reasons: {
        "no-citations": "Yeh statement aapke document ke kisi hisse ki taraf ishaara nahi karta tha.",
        "unresolved-citations":
          "Yeh statement jin hisson ki taraf ishaara karta tha, unhe aapke document se milaya nahi ja saka.",
        "invalid-claim": "Yeh statement aise roop mein aaya jise ClauseCompass check nahi kar saka.",
      },
      why: "ClauseCompass sirf woh statements dikhata hai jinhe woh aapke document ki apni wording tak trace kar sake, isliye yeh bina verify kiye dikhane ke bajaye rok liya gaya.",
    },
  };
