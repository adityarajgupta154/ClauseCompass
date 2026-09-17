---
name: Review Prompts pipeline decisions
description: How rules become prompts - which relevances go to the model, how a claim is tied to its rule, what counts as withheld, and the mock's assignment behaviour.
---
# Registry selects, model phrases, template covers the rest

- Only primary and secondary rules for the stage are phrased by the model; background rules render the registry template (`not-asked`). **Why:** background prompts nobody reads first would cost model calls; the template is already responsible language, checked by the registry lint.
- A claim belongs to a rule only if its category names the rule **and its quote comes from an excerpt selected for that rule**. The validator puts the quote-bearing citation first, so placement reads `source_chunk_ids[0]`; checking "any citation belongs to the rule" let a prompt rest on another rule's clause. Fallback when the key is wrong: the quote's excerpt, if selected for exactly one rule, and the claim takes that rule's key. A long shared paragraph is credited to a second rule only if that rule's match sits inside the window actually sent.
- `withheld` means "model phrasings not shown": validator rejections plus placement drops (unplaceable, or a second claim for a rule). Copy says "could not be verified against the clause it was written for" so both cases read true. **Why:** counting only validator drops under-reported and made the status line lie when a claim was silently dropped.
- The mock follows the task line's `key (Title): p1, p2` assignments (one claim per key from its first excerpt, phrased as a check) so the golden suite pins `withheld === 0` per fixture and stage; if the task-line format or the review-register check changes, update the mock or the goldens report phantom withholding.
- Endpoint is stateless like the map: the client re-posts the file on `/review`; the "nothing stored" status copy on both screens must change with the session task. The client sends no `documentType` yet (upload-side classification is not built), so the "Not found" list is stage-scoped only; that fix belongs to the interview/document-type task.
