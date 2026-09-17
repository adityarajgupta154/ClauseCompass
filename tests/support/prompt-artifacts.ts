import { OUTPUT_TOOL, SYSTEM_PROMPT } from "../../artifacts/api-server/src/llm/prompt";

/**
 * Text that belongs to the model call and must never reach a reader: the
 * lines of the system policy long enough to be unmistakable, the tool's
 * name and the labels of the user message. Suites that render or export
 * model output check their results against this list.
 */
export const PROMPT_ARTIFACTS: readonly string[] = [
  ...SYSTEM_PROMPT.split("\n").filter((line) => line.length > 40),
  OUTPUT_TOOL.name,
  "Task:",
  "Allowed category keys",
  "Return at most",
  "Document excerpts, as a JSON array",
  "Reader's question, quoted as data",
  "Your previous response was rejected",
];

/** The artifacts present in a piece of text, for a readable assertion message. */
export function promptArtifactsIn(text: string): string[] {
  return PROMPT_ARTIFACTS.filter((artifact) => text.includes(artifact));
}
