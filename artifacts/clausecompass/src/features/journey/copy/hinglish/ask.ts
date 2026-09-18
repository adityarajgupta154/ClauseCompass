export const ask = {
    heading: "Is document ke baare mein poochhein",
    lead: "English ya Hinglish mein sawaal likhein. ClauseCompass jawaab mein wahi batata hai jo document khud kehta hai, har baat uske exact shabdon par tiki hui, ya bata deta hai ki document is sawaal ka jawaab nahi deta. Yeh andaza nahi lagata, aur yeh nahi batata ki kya karna hai.",
    back: "Document map par wapas",
    link: "Is document ke baare mein poochhein",
    question: {
      label: "Aapka sawaal",
      hint: (max: number) =>
        `Zyada se zyada ${max} characters. Aapke shabd pehle yahin, aapke browser mein padhe jaate hain (kisi insaan ko nuksaan ka zikr hone par official help aati hai), phir AI model ko document ke un paragraphs ke saath bheje jaate hain jinmein inke shabd milte hain, aur kuch nahi. Jawaab aane ke baad aapka sawaal rakha nahi jaata; document khud aapke session mein tab tak rehta hai jab tak session khatam nahi hota, jaisa upload screen par likha hai.`,
      ask: "Poochhein",
      asking: "Jawaab ke liye document padha ja raha hai. Isme aam taur par kuch second lagte hain.",
      samples: {
        heading: "Ya inmein se koi try karein",
        use: "Yeh sawaal poochhein",
      },
      sampleQuestions: [
        "Notice period kitna hai?",
        "Deposit kab wapas milega?",
        "Dispute kaun si court dekhegi?",
        "Kya main chhodne ke baad competitor ke saath kaam kar sakta hoon?",
      ],
    },
    thread: {
      heading: "Aapke sawaal",
      asked: "Aapne poochha",
      note: "Har sawaal ka jawaab document se alag se diya jaata hai. Sawaal aur jawaab is screen ke khule rehne tak is browser mein rehte hain, aur kahin nahi.",
    },
    answer: {
      heading: "Document kya kehta hai",
      brief: "Ek hi baat, kyunki aapki deadline paas hai: wahi jise document sabse zyada support karta hai.",
      withheld: (count: number) =>
        count === 1
          ? "1 aur baat rok li gayi kyunki use document ke shabdon se verify nahi kiya ja saka."
          : `${count} aur baatein rok li gayin kyunki unhe document ke shabdon se verify nahi kiya ja saka.`,
      readAloud: "Jawaab sun kar padhein",
    },
    notInDocument: {
      title: "Document is sawaal ka jawaab nahi deta",
      reasons: {
        "no-evidence": "Document ke kisi paragraph mein aapke sawaal ke shabd nahi milte, isliye AI model ko kuch nahi bheja gaya.",
        "nothing-verified": "Jin paragraphs mein iske shabd milte hain unhe padha gaya, aur unke baare mein koi baat document ke apne shabdon se verify nahi ho saki.",
        "low-confidence": "Jin paragraphs mein iske shabd milte hain unhe padha gaya, aur jo baatein mileen unka support kamzor tha, isliye koi nahi dikhayi gayi.",
      },
      takeIt: "Yeh sawaal, jaisa hai, kisi lawyer ya legal-aid service ke liye:",
      help: "Official help jinse aap sampark kar sakte hain",
    },
    errors: {
      title: "Sawaal ka jawaab nahi diya ja saka",
      retry: "Phir se poochhein",
    },
  };
