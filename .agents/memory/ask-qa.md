---
name: Ask about this document (Q&A)
description: Decisions behind the grounded question-answering journey (/ask, POST /sessions/:id/ask) and the lessons from building it.
---

# Ask about this document

**Scope rule.** "AI assistant" in this product = grounded document Q&A, not an open chatbot. One question, retrieval picks the passages, the same forced-tool-call + quote validator as the map, refusal with the question handed back when nothing verifies. No fine-tuning; "training" = project-grounded prompt + BM25 + golden questions + a live eval script (`pnpm eval:ask`).
**Why:** PRD FR-08 / §8 (unsupported question → "the document does not answer this", never a guess). The user declined a scope question, so these defaults stand; do not widen to chat.

**Wording rule.** Never write "never a guess" or "or not at all" as a guarantee in API descriptions or docs. The validator checks the quote in the cited passage, register and confidence; it cannot judge whether a statement says more than its quote. Say that, and that the quote is shown beside every statement.
**Why:** an architect review flagged the overclaim; the honest boundary is already how the map/review copy is phrased.

**Concurrency.** A question is not a prepared output: it runs unshared under the session's in-flight signal (`InFlight.run`, counted, not keyed by kind) so a DELETE aborts the model call, and the session is looked up once more before the answer is sent. Prepared outputs use `share`; do not route questions through it (two questions must run side by side).

**Cap.** The 500-char cap is measured on the typed words with whitespace tidied, before `tidyQuestion` appends `?`; otherwise a client-legal 500-char question is refused as 501.

**Withheld on invalid output.** When both model attempts fail validation the answer is `nothing-verified` with `withheld: 0` on purpose: the shared claims module reports no rejection count for that path and the reason sentence covers it. Changing that means changing the map/review contract too.

**Live checks.** The screenshots and eval need the real provider: start the API for them with `env -u ANTHROPIC_API_KEY` (the user's own key returns 401; the integration key works) and without `LLM_PROVIDER=mock`. Eval floors: ≥80% answered from the right clause, ≥70% unsettled refused; last run 25/27 + 8/9.

**Workspace quirk.** `git stash` / `git stash pop` in this workspace silently dropped one tracked file's edit (docs/design-prompts.md) while other edits survived. Do not stash to measure HEAD; use a temporary index (`GIT_INDEX_FILE`) or `git show HEAD:path`.
