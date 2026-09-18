import { readFileSync } from "node:fs";
import { detectClauseLabel } from "@workspace/rules";
import { askDocument, type Answer } from "../../artifacts/api-server/src/analysis";
import { splitParagraphs } from "../../artifacts/api-server/src/extraction/paragraphs";
import { getConfig } from "../../artifacts/api-server/src/lib/config";
import { createLlmProvider } from "../../artifacts/api-server/src/llm";
import { GOLDEN_QUESTIONS } from "../golden/questions";

/**
 * The live-model eval for "Ask about this document": the golden question
 * table (tests/golden/questions.ts) run against the configured model, the
 * way a session would run it, with the results printed per question and
 * summed per fixture. Run it after a change to the task line, the system
 * prompt, the retrieval data or the model:
 *
 *   pnpm eval:ask
 *
 * It reads the same environment the API server does (ANTHROPIC_API_KEY or
 * the Replit Anthropic integration; LLM_MODEL). It refuses to run against
 * the mock: the mock answers every excerpt it is given, which would make
 * the "does not settle" questions below pass for the wrong reason.
 *
 * What counts. A golden question passes when the answer is `answered`
 * and cites the clause that answers it. A question the document is on the
 * subject of but does not settle passes when the answer is
 * `not-in-document`; an answer to one of those is printed in full, since
 * whether it is a fair statement of the document or a guess that got
 * through is a judgement for the person reading the run. The exit code is
 * non-zero when a pass rate is below its floor, so the run can gate a
 * change; the floors are deliberately below 100 percent because the model
 * is not deterministic and a single miss is worth reading, not failing on.
 */

const FLOORS = { answered: 0.8, refused: 0.7 };
const root = new URL("../../", import.meta.url);

function loadChunks(file: string) {
  return splitParagraphs(readFileSync(new URL(`samples/${file}`, root), "utf8")).map((text, index) => ({
    id: `p${index + 1}`,
    text,
    location: { page: null, paragraph: index + 1, clause: detectClauseLabel(text)?.label ?? null },
  }));
}

function citedClauses(answer: Answer): string[] {
  const byId = new Map(answer.passages.map((passage) => [passage.id, passage]));
  const clauses = answer.claims.flatMap((claim) => claim.source_chunk_ids.map((id) => byId.get(id)?.location.clause ?? id));
  return [...new Set(clauses)];
}

function rate(passed: number, total: number): string {
  return total === 0 ? "n/a" : `${passed}/${total} (${Math.round((passed / total) * 100)}%)`;
}

async function main(): Promise<number> {
  process.env.NODE_ENV ??= "development";
  process.env.PORT ??= "1";
  process.env.AUTH_PROVIDER ??= "mock";
  const config = getConfig();
  if (config.llm.provider === "mock") {
    console.error("eval:ask runs against the live model only; unset LLM_PROVIDER=mock.");
    return 2;
  }
  const provider = createLlmProvider(config.llm);
  const model = config.llm.model;
  console.log(`Ask about this document — live eval against ${provider.name} / ${model}\n`);

  let answeredPassed = 0;
  let answeredTotal = 0;
  let refusedPassed = 0;
  let refusedTotal = 0;

  for (const fixture of GOLDEN_QUESTIONS) {
    const chunks = loadChunks(fixture.file);
    console.log(`== ${fixture.id} (${fixture.reader}) ==`);

    for (const [question, clause] of fixture.answered) {
      answeredTotal += 1;
      const answer = await askDocument(chunks, question, { provider, model });
      const cited = citedClauses(answer);
      const passed = answer.status === "answered" && cited.includes(clause);
      if (passed) answeredPassed += 1;
      console.log(`${passed ? "PASS" : "MISS"}  "${question}" → ${answer.status}${answer.reason ? ` (${answer.reason})` : ""}; cited ${cited.join(", ") || "-"}; wanted ${clause}; withheld ${answer.withheld}`);
      if (!passed) for (const claim of answer.claims) console.log(`        · ${claim.text}  ["${claim.quote}"]`);
    }

    for (const question of fixture.outside.noAnswer) {
      refusedTotal += 1;
      const answer = await askDocument(chunks, question, { provider, model });
      const passed = answer.status === "not-in-document";
      if (passed) refusedPassed += 1;
      console.log(`${passed ? "PASS" : "READ"}  "${question}" → ${answer.status}${answer.reason ? ` (${answer.reason})` : ""}; withheld ${answer.withheld}`);
      if (!passed) for (const claim of answer.claims) console.log(`        · ${claim.text}  ["${claim.quote}" @ ${citedClauses(answer).join(", ")}]`);
    }
    console.log("");
  }

  const answeredRate = answeredTotal === 0 ? 1 : answeredPassed / answeredTotal;
  const refusedRate = refusedTotal === 0 ? 1 : refusedPassed / refusedTotal;
  console.log(`Golden questions answered from the right clause: ${rate(answeredPassed, answeredTotal)}; floor ${FLOORS.answered * 100}%`);
  console.log(`Unsettled questions refused: ${rate(refusedPassed, refusedTotal)}; floor ${FLOORS.refused * 100}% (READ lines above are worth reading)`);
  const ok = answeredRate >= FLOORS.answered && refusedRate >= FLOORS.refused;
  console.log(ok ? "\nEval passed." : "\nEval below a floor.");
  return ok ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  },
);
