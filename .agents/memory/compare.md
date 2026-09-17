---
name: Two-version comparison (compare view)
description: Decisions behind the deterministic compare pipeline and its client; what to keep consistent when tuning alignment, classification, or the v2 fixture.
---
# Compare is deterministic: the server returns data, the client returns words

**Why:** FR-07 asks for old/new excerpts side by side with source locations and a change kind. A model call would add latency, cost and an ungrounded paraphrase to a step that is mechanical; the "plain-language impact" of PRD §5 step 6 is a fixed per-kind sentence in the client copy, which keeps it under the Responsible Language lint. The server sends kinds, signals and verbatim `values`; the client never re-detects anything.

**How to apply:** a new thing for a card to say is copy keyed by kind or status, not a server string. A new signal kind is a detector + weight + precedence entry, then re-pin the goldens.

# Alignment: label match is loose, the one-for-one gap is a second pass, size is capped

**Why:** a rewritten clause that keeps its number and topic words fell under the general similarity threshold and showed as removed + added, hiding the side-by-side diff the acceptance line needs; the clause label is strong evidence on its own. Short unnumbered lines have too few bigrams for any bigram threshold, so a gap holding exactly one removed and one added paragraph is re-tested on single words. The DP table is quadratic in paragraphs and the word cap alone would allow 30,000 one-word paragraphs a side, so the pair count is capped (422) before anything is allocated; at the cap the adversarial all-similar case runs in well under a second only because shared counts are dense typed rows, not maps.

**How to apply:** tune thresholds against the fixture pair and the cross-document case (rental v1 vs the offer letter must stay at a handful of aligned paragraphs). Moved clauses show as removed + added — the documented limit, not a bug to chase with a non-monotonic matcher.

# Diff: punctuation is ignored in the first pass, never lost

**Why:** stripping edge punctuation from token identity stops a reworded sentence from also marking every comma that moved, but it made a punctuation-only edit (full stop → question mark) vanish as "unchanged". The diff now re-runs exactly when the lenient pass sees nothing yet the normalised texts differ.

**How to apply:** "no changed spans" from the diff means the texts are the same up to case/quotes/dashes; do not add another "diff saw nothing" short-circuit upstream.

# Classifier weights favour amounts, durations and dates over modals

**Why:** the acceptance cards (late fee, notice period) also contain modal verbs and a remedy-ish word; with equal weights duty/remedy out-voted money/time. Detectors count only where they overlap a changed span, and nested same-kind detections are pruned so "one (1) month's" is one hit.

**How to apply:** when a fixture change classifies wrongly, read the `signals` array to see which detectors overlapped the changed span, then adjust a weight or the pruning and re-pin the golden; never special-case clause numbers.

# Multi-file routes take all their upload places in one step

**Why:** two concurrent compares each holding one place while waiting for a second would deadlock at the gate limit; `acquire(places)` is all-or-nothing with FIFO waiters, and the files are parsed one after the other through the parse gate.
