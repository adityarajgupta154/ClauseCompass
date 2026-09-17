---
name: Clause-rule registry
description: Why the rule table is a derivation, and how to change rules without silently changing what the product flags.
---
# Derived table, not the PRD's

The PRD referenced a clause-rule table from a source document that is not in the repo. The five families came from the task prompt, the rule set from FR-04 (parties, dates, money, duties, termination, dispute wording), FR-07 change classes and the §8 stage table. If the user supplies the original table, reconcile rule by rule rather than replacing the file: the golden run and the `category` keys carried on claims depend on the ids.

# A rule change is a product change

**Why:** Patterns are deliberately broad (the paragraph is the unit, several rules can fire on one), so the only thing that stops them drifting into headings, schedules, signature blocks and boilerplate is the pinned set of hits and non-hits on the three fixtures.

**How to apply:** After touching a pattern, run the rules over all three fixtures, read every hit gained or lost before updating the pinned lists, and prefer `all`/`none` context conditions over narrowing a keyword. Context that mattered so far: "notice" only counts as an exit notice alongside ending/terminating/leaving language; "shall not" needs an actor before it; late-fee wording is excluded when it is merely a deposit deduction; "working hours" is not a hours clause when an IP clause says "whether or not during working hours". Apostrophes must accept the curly form (Word documents). Uncased scripts (Devanagari) must never be treated as all-caps headings.
