# Deployment

How the two services run on a host, and what changes between a single server and a host that runs the API as a function. The README's [Setup](../README.md#setup) section covers local runs and the environment variables; this page covers the shapes.

## The two shapes

The web app is static files (`artifacts/clausecompass/dist/public`) that call `/api` on their own origin. The API is one Express app (`artifacts/api-server`), bundled by esbuild into `dist/index.mjs`, which listens on `PORT`, and `dist/vercel.mjs`, which exports the same app for a host that calls it per request.

| | One server (Replit, a VM, a container) | Vercel |
| --- | --- | --- |
| Web app | Served as static files from the same origin as `/api` | Vercel's CDN, from `outputDirectory` |
| API | `node dist/index.mjs`, one long-lived process | One function (`api/index.mjs`) behind the `/api/(.*)` rewrite; instances start and stop as traffic demands |
| Sessions | `SESSION_STORE=memory` (default): the process's memory, swept every minute | `SESSION_STORE=redis` (required; the memory store is refused when `VERCEL=1`): a Redis database every instance shares |
| Budgets, gates, in-flight sharing | Per process | Per instance: a burst may be spread over several instances, each with its own budgets |
| Upload cap | 10 MB (`UPLOAD_MAX_MB` default) | 4 MB (`UPLOAD_MAX_MB=4`, `VITE_UPLOAD_MAX_MB=4`): Vercel refuses request bodies over 4.5 MB before the function runs |
| Client address for budgets | `TRUST_PROXY` per the proxy in front; Replit's edge rewrites the header, so `true` there | `TRUST_PROXY=true`: Vercel's edge sets `X-Forwarded-For` itself |

## The Redis session store

`SESSION_STORE=redis` keeps each session as one hash, `session:<id>`, in a Redis database (`src/sessions/redis-store.ts`), reached one of two ways, both written in the repository rather than taken from a client package: Upstash's REST API (`upstash-rest.ts`; an https URL and a token) or the Redis wire protocol over a socket (`redis-socket.ts`, `resp.ts`; a `redis://` or `rediss://` URL with the password in it, as Redis Cloud, Upstash and most hosts hand one out). The store is the same code over either; a session written over one is read over the other. What the database holds:

- `owner`: the reader's uid, readable, because the ownership check runs inside the database (a script) so a lookup, its TTL touch and a delete are each one atomic step and nobody else's request moves the session's clock.
- `meta`: stage, document type and creation time. No text.
- `doc:<slot>` and `out:<kind>`: the extracted document and each prepared output, compressed and encrypted (AES-256-GCM) under `SESSION_STORE_KEY` with the session id, the owner's uid and the field name bound in (`src/sessions/sealed.ts`). The database, its provider and its backups hold no readable document text; a value copied to another session or field does not open, and neither does a session whose `owner` field was rewritten in the database to somebody else's uid (it is deleted on that lookup).

Expiry is the key's TTL: set on create, set again on every owner lookup (the sliding 30 minutes), so the database removes an idle session on its own clock; the API never needs a sweeper there. The 100-session cap is a `DBSIZE` check inside the create script (so two uploads cannot both pass it), which is why the database must be this API's own, with nothing else in it. A value that will not open (the key was changed, the value was altered) makes the session gone: the key is deleted, a warning is logged, and the reader is asked to upload again. A database that cannot be reached, times out or answers unexpectedly is a `503 store-unavailable` with `Retry-After: 5`; nothing is served from a guess.

Rotating `SESSION_STORE_KEY` retires every live session at once, which is the intended response to a suspected leak of the key or the database credential.

Which way the database is reached follows from what is set (`src/lib/config.ts`): `SESSION_STORE_URL` first, an https REST URL (with `SESSION_STORE_TOKEN`) or a `redis://` / `rediss://` URL; then the REST pair as the Upstash integration on Vercel (`KV_REST_API_URL`, `KV_REST_API_TOKEN`) or Upstash's console (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) names it; then `REDIS_URL`, as the Redis Cloud integration on Vercel and most hosts set it. When a provider sets both, the REST pair is used: an HTTPS request holds nothing open between one instance's calls and the next. Over the socket the client keeps one connection per instance, opened on the first command and again after it is lost, and every command has the same 8-second limit as a REST request. With `redis://` (no TLS) the values still cross the wire sealed, but the database password and the owner uids travel in the clear, so a plain `redis://` to a host beyond the machine and its private network is refused at boot unless `SESSION_STORE_ALLOW_PLAINTEXT=true` says that is accepted; prefer the database's `rediss://` URL where the provider offers one.

What stays per instance: the request budgets, the analysis and extraction gates, the model-call cap, and the sharing of one analysis run between concurrent requests for it. A delete aborts the model calls in flight on the instance that received it; an output that finishes on another instance for a session deleted meanwhile is dropped rather than kept (`saveOutput` refuses a gone session).

## Vercel, step by step

The repository carries the two files Vercel needs at its root:

- `vercel.json`: `framework: null` (so Vercel does not detect and compile the Express app itself), the install and build commands, the web app's `outputDirectory`, the one function with `includeFiles` for the API bundle and its worker (`artifacts/api-server/dist/**/*.mjs`), the rewrites (`/api/(.*)` to the function, everything else to `index.html` for the client-side routes) and the static headers.
- `api/index.mjs`: re-exports the app from `artifacts/api-server/dist/vercel.mjs`, built by the build command. `src/vercel.ts` validates the environment before any other module loads, exactly as `src/index.ts` does, and names the two pdf.js modules the extraction worker loads at run time so Vercel's file tracer ships them with the function.

1. **Create the Redis database.** In the Vercel project, Storage → Marketplace → Upstash (Redis) or Redis Cloud (or create one in either console). Use a fresh database for this app alone. Upstash's integration injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` (and `REDIS_URL`); Redis Cloud's injects `REDIS_URL`. The API reads those names when `SESSION_STORE_URL` / `SESSION_STORE_TOKEN` are not set by hand. A Redis Cloud `REDIS_URL` is plain `redis://` unless TLS was enabled on the database: either enable it and use the `rediss://` URL, or set `SESSION_STORE_ALLOW_PLAINTEXT=true` to accept that the database password and the owner uids (not the documents, which are sealed) cross the network in the clear.
2. **Project settings.** Root Directory: the repository root. Framework Preset: Other. Leave the build and output settings to `vercel.json`. Node.js version: 22.x (the API needs 22.13 or newer).
3. **Environment variables** (Settings → Environment Variables, for Production and Preview):

   | Variable | Value |
   | --- | --- |
   | `ANTHROPIC_API_KEY` | the model key |
   | `FIREBASE_PROJECT_ID` | the Firebase project whose tokens the API accepts |
   | `SESSION_STORE` | `redis` |
   | `SESSION_STORE_KEY` | `openssl rand -hex 32` |
   | `SESSION_STORE_ALLOW_PLAINTEXT` | `true`, only with a plain `redis://` URL (step 1) |
   | `TRUST_PROXY` | `true` |
   | `UPLOAD_MAX_MB` | `4` |
   | `VITE_UPLOAD_MAX_MB` | `4` |
   | `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` | the Firebase web config |
   | `VITE_SITE_URL` | the deployment's public address, `https://…` |
   | `VITE_FEEDBACK_URL` | optional |

   Vercel sets `VERCEL=1` and `NODE_ENV=production` itself. The `VITE_*` values are read at build time, so a change to them needs a redeploy.
4. **Firebase.** Authentication → Settings → Authorized domains: add the Vercel domain (and the preview domain pattern if previews should sign in).
5. **Deploy**, then check `https://<domain>/api/healthz` (200: the function booted and the database answered it), sign in, upload a PDF from `samples/` and open the document map, and press "Delete my document now". The PDF matters: it proves the tracer shipped pdf.js with the function. A `503 store-unavailable` from the health check or an upload means the database cannot be reached or refuses the credential; a `500` on the health check means the environment is invalid, and the function log shows the configuration problem by name.

Limits that are Vercel's, not the code's: request bodies over 4.5 MB are refused by the platform (hence the 4 MB cap); a function invocation ends at `maxDuration` (300 s in `vercel.json`, which needs Fluid compute, on by default for new projects; without it the Hobby plan's cap is 60 s and the deploy says so); a cold instance adds its start-up to the first request.

## Replit

The Replit deployment is the single-server shape: one API instance with the memory store, `TRUST_PROXY=true` because Replit's edge rewrites `X-Forwarded-For`, and the web app served as static files with `/api` routed to the API. Nothing on this page needs setting there.
