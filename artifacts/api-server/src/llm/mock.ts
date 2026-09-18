import { MODEL_OUTPUT_LIMITS } from "@workspace/grounding";
import type { LlmProvider, LlmRequest, LlmResponse } from "./provider";

/**
 * LLM_PROVIDER=mock: no network, canned output that is visibly canned. The
 * mock reads the excerpt array back out of the user message, the way a model
 * would, and "restates" each excerpt by quoting its opening words, so the
 * rest of the pipeline (validator, citations, rendering) runs exactly as it
 * would with a real model. Every statement is prefixed so nobody mistakes it
 * for analysis.
 *
 * When the task line assigns excerpts to category keys ("key (Title): p1,
 * p2", as the review-prompts builder writes it), the mock answers one claim
 * per key from that key's first excerpt, phrased as a check (the review
 * register that call requires); otherwise it answers one statement per
 * excerpt under the first allowed key.
 */

interface Excerpt {
  id: string;
  text: string;
}

/** The JSON array is the last line of the user message; see prompt.ts. */
function readExcerpts(user: string): Excerpt[] {
  const line = user.trimEnd().split("\n").at(-1) ?? "";
  try {
    const parsed: unknown = JSON.parse(line);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is Excerpt => typeof item?.id === "string" && typeof item?.text === "string")
      : [];
  } catch {
    return [];
  }
}

function readMaxClaims(request: LlmRequest): number {
  const claims = (request.output.schema.properties as { claims?: { maxItems?: unknown } } | undefined)?.claims;
  return typeof claims?.maxItems === "number" ? claims.maxItems : MODEL_OUTPUT_LIMITS.maxClaims;
}

function readCategories(request: LlmRequest): string[] {
  const claims = (
    request.output.schema.properties as { claims?: { items?: { properties?: { category?: { enum?: unknown } } } } }
  ).claims;
  const options = claims?.items?.properties?.category?.enum;
  const keys = Array.isArray(options) ? options.filter((option): option is string => typeof option === "string") : [];
  return keys.length > 0 ? keys : ["general"];
}

/** Category key to the excerpt ids the task line lists for it, in the order the keys appear. */
function readAssignments(user: string, allowed: readonly string[]): Map<string, string[]> {
  const assignments = new Map<string, string[]>();
  const task = user.trimEnd().split("\n").slice(0, -1).join("\n");
  for (const match of task.matchAll(/\b([a-z][a-z0-9-]*) \([^)]*\): (p\d+(?:, p\d+)*)/g)) {
    const [, key, ids] = match;
    if (key === undefined || ids === undefined) {
      throw new Error("the assignment pattern did not return its required captures");
    }
    if (allowed.includes(key)) assignments.set(key, ids.split(", "));
  }
  return assignments;
}

const QUOTE_WORDS = 8;

/**
 * One canned claim. `mode` "statement" restates the excerpt (what the
 * document map asks for); "prompt" puts it to the reader as something to
 * check, which is the review register the review-prompts call requires.
 */
export function mockClaim(excerpt: Excerpt, category: string, mode: "statement" | "prompt" = "statement") {
  const words = excerpt.text.trim().split(/\s+/);
  const quote = words.slice(0, QUOTE_WORDS).join(" ");
  const sentence = excerpt.text.trim().split(/(?<=[.!?।])\s+/, 1)[0] ?? excerpt.text;
  const body = mode === "prompt" ? `check the passage that begins "${sentence}"` : `this passage begins "${sentence}"`;
  const text = `Demo output (mock model, not analysis): ${body}.`.slice(0, MODEL_OUTPUT_LIMITS.claimTextChars);
  return { text, quote, source_chunk_ids: [excerpt.id], category, confidence: 0.75 };
}

/** A provider whose answer is computed from the request by `respond`; the default restates the excerpts. */
export function createMockProvider(respond: (request: LlmRequest) => unknown = demoOutput): LlmProvider {
  return {
    name: "mock",
    async complete(request: LlmRequest): Promise<LlmResponse> {
      return { output: respond(request), stop: "complete", usage: null };
    },
  };
}

export function demoOutput(request: LlmRequest): unknown {
  const categories = readCategories(request);
  const excerpts = readExcerpts(request.user);
  const maxClaims = readMaxClaims(request);
  const assignments = readAssignments(request.user, categories);
  if (assignments.size > 0) {
    const byId = new Map(excerpts.map((excerpt) => [excerpt.id, excerpt]));
    const claims = [...assignments]
      .map(([category, ids]) => {
        const excerpt = ids.map((id) => byId.get(id)).find(Boolean);
        return excerpt ? mockClaim(excerpt, category, "prompt") : null;
      })
      .filter((claim) => claim !== null);
    return { claims: claims.slice(0, maxClaims) };
  }
  return { claims: excerpts.slice(0, maxClaims).map((excerpt) => mockClaim(excerpt, categories[0]!)) };
}
