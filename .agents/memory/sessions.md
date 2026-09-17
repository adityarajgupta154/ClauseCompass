---
name: Sessions (FR-12)
description: Why the session/TTL/delete design is shaped the way it is — session opened at Continue, files never resumable after refresh, delete must clear the client cache, the client mirrors the server clock, and the upload race guard. Read before touching sessions on either side.
---
# Session lifecycle decisions

- **A session is opened at the upload screen's Continue, not at file selection.** Why: the notice promises "nothing leaves your browser until you press Continue"; a session on selection would break that sentence. How to apply: any new intake path must open the session at the explicit send, never on a change event.
- **Raw bytes are never stored; a refresh cannot resume a session.** Files live only in React state, so after a reload the stored session id is an orphan and the client deletes it at boot. Why: the privacy story ("the file itself is not stored") outranks resume convenience. If resume is ever wanted, it is a product decision to be raised, not a bug.
- **Delete must clear the browser's query cache, not only the server.** Why: outputs are cached in TanStack under the session key; without the cache drop a "deleted" document keeps rendering from memory (the first review round caught this in the client, not the server).
- **Degraded outputs (`model-unavailable`) are returned but not cached in the session.** Why: caching them would make the whole session's map/prompts permanently degraded after one provider hiccup; a retry should be able to do better.
- **The client mirrors the server's sliding clock instead of trusting the cache TTL.** A route change touches the session (≥ 5 s apart, anchored at request start so skew cannot matter); a timer at `receivedAt + ttlMinutes` (and the tab becoming visible after that) ends the session locally *with a DELETE only* — never a request that would slide the clock — and sends the reader to the upload screen with an explanation. Why: without this, cached screens outlive the server's copy, and a refetch-based timer would keep an abandoned tab's session alive forever (observed with a 1-minute TTL before the design changed).
- **Expiry/touch/delete guards compare the session *object*, not the id.** Why: a touch installs a fresh description of the same id; an old timer or a slow explicit delete matching by id alone would end or clear the fresher state (second review round).
- **Upload race guard: an in-flight upload is never aborted on SPA navigation.** The response is awaited and the session deleted if the screen was left or the File identities changed meanwhile. Why: an abort can cut the request off *after* the server opened the session, leaving an orphan until TTL; letting it settle costs one discarded extraction at most.
- **In-memory store ⇒ single API instance.** Autoscale fan-out would split sessions across processes; the lib/db keep-or-remove decision is really this decision.

# Verifying
Run the API by hand with `SESSION_TTL_MINUTES=1` and the mock provider to watch expiry end to end in a minute; the browser walkthrough scripts live outside the repo (/tmp), rebuild them from the flow above if needed.
