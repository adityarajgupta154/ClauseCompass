---
name: Official-help resource registry
description: Decisions behind data/resources + lib/resources (FR-10): bundled by the client, source-backed wording, what was deliberately left out.
---
# The registry is bundled by the client, not served by the API

**Why:** the API is down whenever there is no model key, and a helpline must never wait on a request. The task text said the API would read `data/resources/`; the README explains why it does not.

**How to apply:** consumers import `@workspace/resources`; never fetch the JSON over HTTP. The card list takes a concern id and resolves the registry itself, so there is no prop through which model text can reach a card; keep it that way. The libs' `lib: es2022` config has no `URL`, hence regex host parsing.

# Entry text must be traceable to its one `sourceUrl`

**Why:** the card shows "Last checked <date> · Source: <host>", which promises that the page named supports the sentences above it. Review flagged entries whose detail came from a page other than the one cited (Women Helpline 181 from a Mission Shakti page that 403s to our fetcher), so those entries were trimmed to what the cited page states.

**How to apply:** if a detail is only on a page you could not open, leave the detail out rather than citing the page you could. Tele-Law has no phone number for this reason; e-Daakhil, Nyaya Bandhu, 112.gov.in were unreachable and are absent. No coverage badge ("All of India") is shown: national programme ≠ verified availability in every State.

# Wording constraints

Registry sentences and `copy.resources` run through the responsible-language lint plus an affiliation regex. Phrase eligibility as the service's own terms ("Section 12 covers…", "the Authority decides each application"), never "you are eligible/entitled"; "fake app, website or call", never "scam"; no sentence-initial imperatives; the confirm line is fixed text pinned verbatim by a test.

# Clock quirk

The container clock is UTC and the user's day is IST, so a `lastChecked` of "today" can be a day ahead of UTC; the not-in-the-future test allows one day of slack.

# Hook already in place

`resourceForGuidance(key)` maps every rules `GUIDANCE_KEYS` entry to a registry entry with a phone number; the safety-escalation screen should use it instead of hardcoding numbers. `suggestConcern(documentType)` falls back to `legal-advice` until upload sets a document type.
