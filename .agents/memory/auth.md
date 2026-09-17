---
name: Auth (Firebase sign-in + API token check)
description: Decisions and lessons from adding Firebase Authentication in front of the document journey; what cannot be tested for real and how the mocks pair up.
---
# Shape of the decision

- Gate the document journey only (`/upload` onward); Welcome, `/help`, `/safety`, not-found stay open. **Why:** a helpline must never sit behind a login; the PRD's safety path has to work for a visitor who cannot or will not sign in.
- Verify ID tokens on the API with `jose` (remote JWKS) rather than firebase-admin. **Why:** no service account, nothing of Firebase runs on the server, one small dependency; checks are RS256 + `aud` = project + `iss` = securetoken URL + `sub` non-empty + `exp`. The project id comes from `FIREBASE_PROJECT_ID`, so a token from another Firebase project fails on `aud`.
- Another reader's session is a 404 `session-not-found` (never 403) and a non-owner DELETE is a 204 no-op. **Why:** session ids must not be probeable for existence.
- Firebase *web* config values live in tracked `.replit` `[userenv.shared]` on purpose (they ship in the bundle anyway); the security controls are the Firebase console's Authorized domains + enabled providers. The user should be told when a domain changes (dev domain, published domain) or Google sign-in fails with `auth/unauthorized-domain`.

# Principal changes (found by review, 17 Sep 2026)

- The journey is bound to the signed-in uid on the client too: a `PrincipalBoundary` around the routes forgets files, session, cached outputs and stage when the uid changes (A→signed-out, A→B), and renders nothing for that commit. **Why:** TanStack cache entries never go stale on their own, so without it the next reader on the same tab could see the previous reader's map. Baseline rule: null→uid and loading→uid never reset (the Welcome choice must survive sign-in); escalation always survives.
- The client does *not* ask the server to delete on a principal change. **Why:** the token that could carry the delete is already gone (the state change is what triggers the boundary); the retention window ends the session, as for a closed tab.
- Only the owner's request may slide a session's expiry; the store decides ownership before touching anything (`getOwned`/`deleteOwned`). **Why:** a stranger's refused requests were extending another reader's retention. A regression test for this must cross the *original* expiry (owner-touched session alive, stranger-touched one gone); comparing `expiresAt` values at the same fake time passes with the bug present.
- `RequireStage` sits outside `RequireAuth` on purpose: a forgotten/stage-less visitor lands on Welcome, not on sign-in.

# Testing lessons

- Real Google / e-mail sign-in cannot be driven headlessly. Everything automated goes through the *pair* of mocks: `AUTH_PROVIDER=mock` (API accepts `mock:<uid>`) + `VITE_AUTH_PROVIDER=mock` (client's offline stand-in). Setting only one side gives 401s that look like a bug; the workflows must never carry the mock providers (the a11y run uses a second, hand-started pair — commands in replit.md's Gotchas).
- The test reader uid equals the mock Google user's uid deliberately: session helpers and mounted screens must be the same reader or every screen sees 404.

# Sign-in screen lessons (restyle to the mockups, 17 Sep 2026)

- Sign-in copy describes the *mechanism*, never the guarantee: "opens for the account that uploaded it", not "private / only you / nobody else". **Why:** the architect review read "Your documents stay private" and "for nobody else" as security promises (the design rule forbids them) even though the server rule is owner-only; a web service cannot promise privacy, it can say what it does. The FR-12 note is narrowed the same way ("does not change how long a document is kept" — account records do persist).
- `aria-disabled` keeps focus but does not stop clicks: the screen holds a ref lock set synchronously in `attempt`, and mode switches are refused while a request runs. **Why:** two presses before React rendered `busy` started two Google popups / raced Google against e-mail; a switch mid-request showed the old mode's error in the new one. Test the double press inside one `act` with a held mock promise.
- The h1 changes with the mode without a route change, so the tab title must follow it: a tiny `screen-title` store the page sets (create/reset) and DocumentHead prefers over the route title; sign-in mode sets nothing. Rejected: mode in the URL (`?mode=`) — it would change the mode state model and every runner step that clicks the switch.

# UI lesson

- The one-row header at 1280px has ~1140px of room and the display bar alone is ~530px; a visible name + Sign out pushed it to two rows (sticky header 141px tall). The name is on screen below `lg` and from 1400px, sr-only in between; wraps at 1024–1150 are pre-existing.
