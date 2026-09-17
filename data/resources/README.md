# data/resources/

The reviewed registry of official services that the "Official help you can contact" screen shows (PRD FR-10, §10). Two files:

- `resources.json` — one entry per service: what it is, who runs it, how to reach it, the official page each fact was checked against, and the day it was checked.
- `routing.json` — which entries appear for each concern the reader can pick (`legal-advice`, `rent`, `work`, `consumer`, `cyber`, `safety`), in the order they appear, and which entry answers each guidance key of the safety escalation (`emergency-services`, `police`, `women-helpline`, `child-helpline`, `mental-health-helpline`).

`lib/resources` (`@workspace/resources`) parses both files with a zod schema when it is first imported and throws with the exact problem if they do not fit. The client bundles that library and renders cards straight from it. The API does not serve this data: the screen must work when the API is down or has no model key, and a helpline must never wait on a request. A model never writes or rewrites an entry; the tests fail if a card links anywhere the registry does not name.

## What an entry is

```jsonc
{
  "id": "tele-law",                       // kebab-case, unique; routing refers to it
  "name": "Tele-Law",                     // as the service calls itself
  "runBy": "Department of Justice, ...",  // who operates it, in its own words
  "scope": "national",                    // or { "state": "IN-KA" } for a State-level service
  "summary": "...",                       // what it does, as the service describes it
  "whoItIsFor": "...",                    // optional: the service's own eligibility terms
  "hours": "...",                         // optional, only if the service publishes them
  "contacts": [                           // at least one; shown in this order
    { "kind": "phone", "number": "15100", "label": "..." },
    { "kind": "message", "number": "8800001915", "label": "SMS or WhatsApp" },
    { "kind": "web", "url": "https://...", "label": "..." }
  ],
  "sourceUrl": "https://...",             // the official page the entry was checked against
  "lastChecked": "2026-09-15"             // the day someone opened sourceUrl and confirmed the entry
}
```

Unknown fields are rejected, so a typo in a key fails loudly rather than vanishing.

## Rules for entries

1. **Official sources only.** Every `sourceUrl` and every web contact must be `https` on `*.gov.in`, `*.nic.in` or `tele-law.in` (the allow-list is in `lib/resources/src/schema.ts`). No aggregators, no news articles, no private firms, no NGOs unless a government page names them as the operator.
2. **Every fact comes from the source page.** Write what the service says about itself; do not paraphrase eligibility into promises. If a number or a detail cannot be found on an official page, leave it out: Tele-Law has no phone number here for exactly that reason.
3. **Review register.** Entries are read next to a reader's own document. No "you are entitled", "you qualify", "scam", "dangerous", no sentence-initial instructions ("File a complaint..."), no claim of any connection between ClauseCompass and the service. The tests run the same responsible-language lint over every sentence of the registry as over the product's copy.
4. **`lastChecked` is a promise.** It is the day a person opened `sourceUrl` and confirmed the numbers, links and wording. Update it only when that has been done again; the screen shows it on every card.
5. **Routing is reviewed too.** Every entry must be reachable from at least one concern or guidance key; every concern must list at least one entry; `legal-advice`, `rent` and `work` must include both Tele-Law and NALSA; every guidance key must resolve to an entry with a phone number.

## Adding or re-checking an entry

1. Open the official page, confirm each fact, and write or update the entry with today's date in `lastChecked`.
2. Add its id to the concerns it belongs to in `routing.json`, in the position it should appear.
3. Run `npx vitest run lib/resources tests/resources` from the repository root. The tests cover the schema, the host allow-list, the cross-references, the lint, and the cards' rendering.

State-level entries use `"scope": { "state": "IN-XX" }` (ISO 3166-2 code). None are present yet; the screen shows an "All of India" mark on national entries and no State filter.
