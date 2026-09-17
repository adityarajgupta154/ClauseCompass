---
name: Decision flow (PRD §8 state machine)
description: The judgement calls inside the Context Decision Flow that the code does not explain by itself — where the safety-cue boundary sits and the false positives that shaped it, why escalation is absorbing, the one shared confidence floor, and the keys-not-copy rule.
---
# Safety cues mean force or harm to a person, not hardball

The lexicon fires on threats of violence, being hit, weapons, self-harm, a signature taken by force/threat/duress, confinement, blackmail/extortion, a held passport, harm to a child. It does *not* fire on a threatened lawsuit or police complaint, changed locks, cut utilities, "pressure" or "made" to sign, a bare "zabardasti" (forcibly raised rent is hardball), held certificates, harassment as a topic, or a policy's own words ("misconduct includes violence").

**Why:** Escalation skips document analysis entirely (PRD §8). Over-triggering takes the remedy/notice analysis away from exactly the tenant or employee who came for it; under-triggering fails the PRD row. The tie-break question: would an emergency/helpline route be the right *first* screen for this sentence?

**How to apply:** Harm words need the person in them (me/us/my/mujhe/mere) or an explicit actor; topic mentions stay in analysis. Every negative sentence in the cue test file was a real false positive once — "beta version … hit the deadline" (child), "extortionate" (coercion), "minor changes … touch-ups" (child), "don't want to live in this flat" (self-harm), "signed under pressure" (coercion) — keep adding to that list rather than loosening patterns. Devanagari patterns cannot use `\b` (ASCII word boundary even with the `u` flag). "hafta" alone means week; only "hafta vasool…" is extortion. Cue order in the lexicon is the route priority (child, self-harm, domestic, violence, coercion), and a snapshot decision combines cues from all messages in that order so the screen does not depend on typing order.

# Escalation is absorbing; a new session is a new machine

After a cue, every later event returns the same state object. A "continue anyway" (if the product ever wants one) must start a fresh flow explicitly, never un-escalate.

**Why:** "Skip document analysis entirely" is easiest to prove when nothing downstream can re-enable it.

# Document content enters only as typed dates

No event takes document text; a document-derived deadline's label is carried as opaque data. Instruction-like paragraphs are flagged for the log/UI but nothing is skipped or filtered. PRD row 6 is satisfied structurally — keep it that way when wiring the API (do not add a "document said" text event).

# One confidence floor, keys instead of copy

The 0.6 confidence floor is a grounding-contract constant shared by the client's source card and the flow's answer refusal; do not re-declare it locally. The flow emits copy keys and guidance keys only (numbers and "last checked" dates belong to the FR-10 resource registry; sentences to the client's copy table), so the bilingual task only has to translate the registry's review prompts.

# The flow runs in the browser; escalation ends the session instead of gating the server

Interview text is scanned client-side; no API route ever receives it, so there is no server-side "escalated" flag. The guarantee that no analysis runs is that the escalating transition deletes the session and drops the files, and one outermost route guard sends every address but the safety screen and the helplines to the safety screen — Welcome included, or a typed `/` becomes a way to start analysis without the explicit "Start again".

**Why:** The privacy line is "the words go nowhere"; a server gate would need the text (or a trust-the-client flag) and would be weaker than deleting the data. A review round found two things the first cut got wrong: keeping the regex's matched substring (in state, storage and a quote-back on screen) breaks "the words are not kept" and is a shoulder-surfing risk, so the client drops the cues the moment it escalates and stores only category/guidance/origin; and a fire-and-forget DELETE cannot back the claim "has been deleted", so the deletion is awaited into a status and the screen says only what it knows (deleting / deleted / unconfirmed + retention window; nothing after a refresh).

**How to apply:** Keep the stored escalation in the journey key so a refresh cannot un-escalate; navigate to the safety screen with `replace` so Back cannot show the question. If the interview later carries answers to the server, the safety scan must still happen before the request, on the client. A route-level acceptance ("routes straight to X") is proven by mounting the real routes in happy-dom (per-file environment) with a memory location and a recording fetch stub — pure-function tests plus a manual browser walk were judged insufficient. Copy that survived the language lint here: "in danger", "If a child is at risk", "can act on it", "a document can wait" (avoid "is not safe" / "is dangerous").
