/**
 * The golden questions (PRD section 12): what a reader asks about each
 * synthetic document, and the clause that answers it. Two suites read this
 * table - retrieval.test.ts pins that the clause ranks in the top three
 * hits, ask.test.ts pins that the whole answer pipeline reads that clause
 * and answers from it - and the live-model eval (tests/eval/ask.eval.ts)
 * runs the same questions against the configured model.
 *
 * `outside` holds questions the document does not speak to. The ones under
 * `noWords` share no word with the document, so the pipeline refuses them
 * before any model call; the ones under `noAnswer` share words with it
 * (the document is on the same subject) but it does not settle them, so
 * the refusal has to come from the model returning nothing or from the
 * validator. The mock answers every excerpt it is given, so `noAnswer` is
 * checked only by the live eval; it is the harder promise of the two.
 */

/** [question, clause that answers it] */
export type GoldenQuestion = [question: string, clause: string];

export interface GoldenQuestions {
  /** The fixture id in samples/manifest.json and samples/golden.json. */
  id: string;
  file: string;
  /** Who asks: the reader the stage and document type imply. */
  reader: string;
  answered: GoldenQuestion[];
  outside: {
    noWords: string[];
    noAnswer: string[];
  };
}

export const GOLDEN_QUESTIONS: readonly GoldenQuestions[] = [
  {
    id: "rental-agreement",
    file: "rental-agreement-synthetic.txt",
    reader: "a tenant",
    answered: [
      ["what is the notice period", "4.2"],
      ["notice period kitna hai", "4.2"],
      ["how much is the security deposit", "3.1"],
      ["when will I get my deposit back", "3.2"],
      ["deposit kab wapas milega", "3.2"],
      ["जमा वापस कब मिलेगा", "3.2"],
      ["kiraya kitna hai", "2.1"],
      ["किराया कितना है और कब देना है", "2.1"],
      ["can I keep a pet", "5.4"],
      ["can I break the lease early", "4.2"],
      ["kya main kiraya late de sakta hoon, jurmana kitna hai", "2.2"],
      ["who pays for repairs", "6.2"],
      ["landlord kab ghar mein aa sakta hai", "7.1"],
      ["how much will the rent increase on renewal", "1.2"],
      ["can my friend stay with me as a guest", "5.2"],
    ],
    outside: {
      noWords: ["xylophone quantum spaceship", "kaun sa cricket team jeetega"],
      noAnswer: [
        "is this rent fair for this locality",
        "can the landlord evict me if my salary is delayed",
        "does the agreement say who pays for the electricity meter to be replaced",
        "kya yeh agreement court mein valid hai",
      ],
    },
  },
  {
    id: "offer-letter",
    file: "offer-letter-synthetic.txt",
    reader: "a candidate",
    answered: [
      ["what is the notice period", "7.1"],
      ["how long is probation", "4.1"],
      ["training bond kitna hai", "6.2"],
      ["can I work for a competitor after leaving", "9.1"],
      ["how many days of leave do I get", "5.2"],
      ["can they fire me without notice", "7.2"],
      ["kya bonus guaranteed hai", "3.2"],
      ["till when do I have to accept this offer", "13.1"],
    ],
    outside: {
      noWords: ["xylophone quantum spaceship"],
      noAnswer: [
        "is this salary good for my experience",
        "does the offer include stock options or ESOPs",
        "will I get a company car or a relocation allowance",
      ],
    },
  },
  {
    id: "nda",
    file: "nda-synthetic.txt",
    reader: "a receiving party",
    answered: [
      ["how long does confidentiality last", "4.2"],
      ["which court handles disputes", "9.3"],
      ["what happens if I breach the nda", "8.2"],
      ["kya main unke clients ke saath kaam kar sakta hoon", "6.1"],
    ],
    outside: {
      noWords: ["xylophone quantum spaceship"],
      noAnswer: ["should I sign this nda", "does the nda say who pays my travel costs for meetings"],
    },
  },
];
