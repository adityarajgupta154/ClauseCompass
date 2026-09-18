export const display = {
    label: "Settings",
    language: {
      label: "Bhasha",
      english: "English",
      hinglish: "Hinglish",
    },
    convenience:
      "Hinglish sirf samajhne ki suvidha ke liye hai, authoritative version nahi. Document ki apni wording, aur usse taiyar ki gayi har statement, bina anuvaad ke waise hi dikhti hai jaise hai; packet English mein banta hai.",
    textSize: {
      label: "Text ka size",
      smaller: "Chhota text",
      larger: "Bada text",
      percent: (percent: number) => `${percent}%`,
      status: (percent: number) => `Text ka size ${percent}%`,
    },
    theme: {
      label: "Theme",
      light: "Light",
      dark: "Dark",
      system: "Device jaisa",
    },
    links: {
      help: "Help aur support",
      feedback: "Feedback dein",
      about: "ClauseCompass ke baare mein",
    },
  };
