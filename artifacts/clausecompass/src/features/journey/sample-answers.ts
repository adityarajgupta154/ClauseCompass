import { z } from "zod";
import manifest from "@samples/interview-answers.json";

/**
 * Synthetic interview answers from the repo's samples/ directory, offered on
 * the interview screen so the safety-escalation branch (PRD §8) can be shown
 * without anyone typing a real crisis. Choosing one only fills the box; the
 * words then go through exactly the same scan as typed ones, on Continue.
 * The `expect` field each entry carries is for the test suite, not for here.
 */
const sampleAnswerSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  text: z.string().min(1),
});

export type SampleAnswer = z.infer<typeof sampleAnswerSchema>;

export const SAMPLE_ANSWERS: readonly SampleAnswer[] = z.array(sampleAnswerSchema).min(1).parse(manifest.answers);
