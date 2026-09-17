---
name: API hardening (budgets, gates, proxy trust, CORS) and what it broke
description: Decisions behind the per-client budgets, TRUST_PROXY, closed CORS, the CI/preflight shape and the coverage report; the test-environment consequences (happy-dom same-origin, budgets off in helpers).
---
# Budgets and gates

- Per-client token buckets (600/min all of `/api`, 60/min uploads + analyses), an analysis gate (4 running / 16 waiting → 503 `busy`) and a process-wide model-call cap (8) are the DoS story; every offline test helper sets both budgets to `0`. **Why:** all test traffic comes from 127.0.0.1, so a shared bucket would throttle the suite at random; the budget behaviour has its own test file (`http-hardening.test.ts`).
- Numbers quoted in README, SECURITY.md and docs/threat-model.md are copied from the code by hand; when a limit changes, grep all three (they were caught disagreeing once).

# TRUST_PROXY — never default to `true` in code

- Default `false` (socket peer, `X-Forwarded-For` ignored); the Replit api-server artifact env sets `true`. **Why:** with `trust proxy: true` a client that can reach the server through a proxy that does not rewrite the header buys a fresh bucket per request by forging it — the first version did exactly that and a review caught it. Replit's edge *does* rewrite the header: checked 17 Sep 2026 with a tiny echo server on the API port behind the dev domain — a forged header was dropped and the chain came back as `<client>, <internal>, 127.0.0.1` (three hops, so a fixed hop count would be wrong there; `true` is right only because of the rewrite). Not re-verified on the published domain.
- Validation must match proxy-addr's grammar or Express throws *after* config passed: Node's `isIPv4/isIPv6` is the grammar, plus refuse `/0`, zone ids and leading-zero octets (proxy-addr reads `010.` as octal). A test applies every accepted value to `express().set("trust proxy", …)`.

# CORS closed → happy-dom suites need the API origin

- No cross-origin access unless `CORS_ORIGINS` is set. Consequence: happy-dom suites that mount screens against the booted API child must `window.happyDOM.setURL(apiOrigin + "/")` in their boot hook, because happy-dom enforces the same-origin policy for fetch. Do not reopen CORS for tests; production is same-origin too.
- Unmounting a screen while react-query has an in-flight GET (`/api/sessions/policy`) makes happy-dom log a "socket hang up"; wait for `client.isFetching() === 0 && isMutating() === 0` before unmount (traced by instrumentation, not a guess).

# CI / preflight / coverage shape

- Preflight order: build → test → check:client-secrets → check:size. **Why:** the size ceiling is the step most likely to be red on purpose; it must never hide a secret finding.
- `pnpm audit` is its own CI job: a new advisory fails on its own line while the build/test matrix still reports. Do not describe it as "not failing the build" — a failed job is a failed run.
- Coverage (`pnpm test:coverage`) has no threshold on purpose and excludes tests, `src/testing/`, `pages/dev/` *and* the three stand-in providers (mock LLM, mock auth, client auth-mock); docs must say the numbers are evidence, not a gate.
