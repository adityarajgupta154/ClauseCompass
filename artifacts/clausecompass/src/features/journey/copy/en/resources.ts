/**
   * Official help (FR-10): the reviewed registry in data/resources, shown by
   * the reader's concern. What each service is and how to reach it is data
   * (lib/resources), so this block is only what the screen says around the
   * cards. Two lines are safety copy and read exactly as written: `card.confirm`
   * is on every card, and `lead` says ClauseCompass is connected to none of
   * these services. The responsible-language lint runs over this block in the
   * tests; the concern descriptions describe situations, never what the
   * reader is owed or should do.
   */
  export const resources = {
    heading: "Official help you can contact",
    /** What a search result says about the help screen, the one other screen open to search engines. */
    description:
      "Government-run helplines and legal-aid services in India, what each does and how to reach it. For information; ClauseCompass is not connected to any of them.",
    lead: "Government-run services in India that give legal information and advice, take complaints, or answer in an emergency. ClauseCompass lists them so that you know where to turn. It is not connected to any of them, cannot contact them for you, and does not decide whether a service applies to your situation: that is for the service to say.",
    /** The back link names where the reader came from when the app knows it. */
    backTo: {
      "/": "Back to the start",
      "/upload": "Back to your upload",
      "/interview": "Back to the questions",
      "/map": "Back to the document map",
      "/review": "Back to the review prompts",
      "/compare": "Back to what changed",
      "/packet": "Back to your packet",
      "/ask": "Back to your questions",
      "/safety": "Back to the safety screen",
    } as Record<string, string>,
    back: "Back",
    concernLegend: "What is this about?",
    concernHint: "Choosing changes which services are listed below. It is a way to find the right ones sooner, nothing more; whether a service can take up your matter is for that service to say.",
    concerns: {
      "legal-advice": {
        label: "Legal advice, or free legal aid",
        description: "Talking to a lawyer before signing or replying, or finding out whether free legal aid is open to you.",
      },
      rent: {
        label: "Rent, deposit or eviction",
        description: "A landlord or a tenant, a deposit that has not come back, or a notice to leave.",
      },
      work: {
        label: "Salary, notice period or the workplace",
        description: "An employer, unpaid salary, a notice period, or harassment at work.",
      },
      consumer: {
        label: "A purchase, a service or a refund",
        description: "Something you paid for that was not delivered, was faulty, or was not refunded.",
      },
      cyber: {
        label: "Online fraud or a cyber crime",
        description: "Money taken through a fake app, website or call, or abuse online.",
      },
      safety: {
        label: "Someone is in danger or being forced",
        description: "Threats, violence, a signature or a payment taken by force, or harm to a child.",
      },
    },
    showing: (count: number, label: string) => (count === 1 ? `1 service for “${label}”` : `${count} services for “${label}”`),
    /** Above the safety list only. A number, not an instruction. */
    emergency: "In an immediate emergency, 112 is the number for police, fire and ambulance from any phone in India.",
    linksNote: "Links open in a new tab, so anything you have prepared here stays open. Phone numbers open your phone's dialler.",
    card: {
      runBy: "Run by",
      whoItIsFor: "Who it is for",
      howToReach: "How to reach it",
      hours: "Hours",
      opensInNewTab: "opens in a new tab",
      lastChecked: (date: string) => `Last checked ${date}`,
      source: "Source:",
      confirm: "Confirm availability and eligibility with the service directly.",
    },
    /** Where the screen is linked from. */
    entry: {
      footer: "Official help you can contact",
      packet: "Next: official help you can contact",
      welcomeHeading: "Need to reach a service now?",
      welcomeLine: "Official legal-aid services and helplines, each with the date it was last checked. No document or upload needed.",
      welcomeLink: "See official help",
    },
  };
