<a id="top"></a>

<p align="center">
  <img src="docs/screenshots/journey.gif" width="900" alt="One journey through ClauseCompass in eight frames: the welcome screen, the three situations to choose from, a sample offer letter chosen on the upload screen, the interview question, the document map with a statement and the paragraph it rests on, that paragraph opened verbatim, the review prompts, and the preparation packet.">
</p>

<h1 align="center">ClauseCompass</h1>

<p align="center"><b>Plain-language navigation for legal documents.</b></p>

<p align="center">Upload an offer letter, a rent agreement or an NDA. ClauseCompass shows who it binds and to what, the dates and amounts in it, review prompts for the clauses that matter in your situation, and a packet to take to a lawyer or a free legal-aid service. Every statement it makes about the document points at the paragraph it came from.</p>

<p align="center">
  <a href="https://github.com/adityarajgupta154/ClauseCompass/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/adityarajgupta154/ClauseCompass/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <img alt="Node 22.13 or newer" src="https://img.shields.io/badge/node-%E2%89%A5%2022.13-339933?logo=node.js&logoColor=white">
  <img alt="pnpm 10" src="https://img.shields.io/badge/pnpm-10-F69220?logo=pnpm&logoColor=white">
  <img alt="TypeScript 5.9" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-20232A?logo=react&logoColor=61DAFB">
  <img alt="Express 5" src="https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white">
  <img alt="Tests: six layers, run offline" src="https://img.shields.io/badge/tests-6%20layers%2C%20offline-2E7D32">
</p>

<p align="center">
  <a href="#chosen-vertical">Why</a> ·
  <a href="#what-it-looks-like">Screens</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#setup">Run it</a> ·
  <a href="#demo-walkthrough-priya">Walkthrough</a> ·
  <a href="#api">API</a> ·
  <a href="#evaluation-evidence">Evidence</a> ·
  <a href="#faq">FAQ</a> ·
  <a href="#documentation">Docs</a>
</p>

> [!IMPORTANT]
> ClauseCompass explains documents; it does not give legal advice. It does not say whether a clause is enforceable, what will happen, whether you qualify for a service, or what to do. It ends in a handoff to the people and services that can: a lawyer, or the free legal-aid channels on its help screen.

Built for the Hack2Skill 2026 hackathon. The requirements this build follows are in [docs/PRD.md](docs/PRD.md); [docs/README.md](docs/README.md) maps each step of the pipeline to the files that implement it.

## Pick your path

| Judging or reading | Running it | Building on it |
| --- | --- | --- |
| [Chosen vertical](#chosen-vertical) → [Problem & approach](#problem--approach) → [What it looks like](#what-it-looks-like) → [Demo walkthrough](#demo-walkthrough-priya) → [Evaluation evidence](#evaluation-evidence) → [Assumptions & limitations](#assumptions--limitations) | [Setup](#setup): [quick start](#quick-start), [running it without any keys](#running-it-without-any-keys), [environment variables](#environment-variables), [preflight](#preflight-before-a-submission-attempt) | [System architecture](#system-architecture) → [How it works](#how-it-works) → [Decision flow](#decision-flow) → [Grounding](#grounding-how-a-statement-earns-its-place-on-screen) → [API](#api) → [Repository layout](#repository-layout) → [Documentation](#documentation) |

## At a glance

| | |
| --- | --- |
| **Situations** | Three, chosen on the first screen: **before signing**, **a problem started**, **compare two versions**. Everything after that is chosen for the stage. |
| **Documents** | TXT, PDF and DOCX up to 10 MB; PDFs up to 50 pages; 30,000 words. No OCR: scans are refused with a message saying so. |
| **Clause rules** | 34, in five families (money, time, duty, exit & remedies, data & IP); each says at which stages it leads. They pick the paragraphs, not the model. |
| **The map** | Six fields: Who is bound by it · How long it lasts · Money · Duties and restrictions · How it can end · If there is a dispute, plus the dates timeline; every statement opens to the paragraph it rests on. |
| **What the model sees** | Only the paragraphs selected for one map field or one rule family, under a per-call cap; never the reader's identity or the interview answer. |
| **What the model may not do** | Judge, predict or advise. A validator checks every sentence against its cited paragraph before it is shown; a sentence that fails twice is withheld and counted. |
| **What the server keeps** | Extracted text and prepared outputs, in memory, for a sliding 30 minutes or until "Delete my document now"; never the uploaded bytes, never a database. |
| **Handoff** | A printable preparation packet and a page of official services: Tele-Law, NALSA legal aid, the 1915, 1930, 112, 181 and 1098 helplines, SHe-Box. |
| **Stack** | React 19 + Vite web client, Express 5 API on Node 22.13+, shared pure-TypeScript libraries, Firebase Authentication for sign-in, the Anthropic Messages API for the restatements. |

## Chosen vertical

Legal document navigation for India, at the moment an ordinary person has to read a document without help: an employment offer letter, a leave-and-licence (rent) agreement, a non-disclosure agreement. The product is stage-aware: the first screen asks whether you are **before signing**, **a problem started**, or want to **compare two versions**, and everything after that is chosen for that stage. It ends in a handoff to services that already exist (Tele-Law, NALSA legal aid, the 1915, 1930, 112, 181 and 1098 helplines, SHe-Box) rather than trying to replace them.

Demo persona: **Priya, 24, first job offer, "Before signing".** She wants to understand salary, joining date, probation, notice period and the IP and non-compete wording, and to walk into HR with specific questions. The [walkthrough](#demo-walkthrough-priya) below is her path.

## Problem & approach

Three gaps, taken from the PRD:

1. Formal consultation costs ₹1,500–5,000 an hour in metro cities, which is out of reach for an everyday contract as opposed to a lawsuit.
2. India already has a first-mile channel. Tele-Law has given more than 1.12 crore pre-litigation advices through Common Service Centres. The gap is not that help does not exist; it is that people cannot describe their problem well enough to use it, and many do not know it exists.
3. At the point of signing, what matters is specific clauses: notice, bond, lock-in, liability cap, arbitration. A general chat tool blurs "explaining this clause" with "advising you about it", which is unsafe and reads as legal advice.

A chatbot answers whatever is typed, from its training data, in a voice that sounds like advice. ClauseCompass is built the other way round: **document → decision → handoff**.

- **Document.** The uploaded text is the only source. It is split into paragraphs, and every statement the model writes about the document carries the id of the paragraph it came from and a quote copied from it. The interface resolves that id before it shows the statement; a statement whose source cannot be found is not shown. (Fixed interface text, the registry's "why it matters" notes and the comparison's summaries are product copy, not model output.)
- **Decision.** What the product does next is decided by a deterministic flow, never by the model: the stage the user chose, a safety-cue scan of the one free-text answer (force or harm to a person ends the document flow and shows helplines), and a registry of 34 clause rules in five families (money, time, duty, exit & remedies, data & IP) that selects the paragraphs worth reviewing for that stage. The model's job is narrow: restate the selected paragraphs in plain language, in a format a validator checks before anything reaches the screen. Statements that judge, predict or advise are rejected and withheld.
- **Handoff.** The output is a preparation packet: the map, the dates, the review prompts as questions to ask, a checklist of records to gather, the citations and the disclaimers, with the official services that fit the situation one link away. It is meant to be printed and carried to a human.

Out of scope on purpose (PRD §3): legal advice, outcome prediction, eligibility decisions, drafting notices, and any claim that model output states Indian law.

## Which situation are you in?

The first screen asks **"What brings you here today?"**. The choice decides two things. Each of the 34 clause rules says whether it is primary, secondary or neither at that stage, and that is what puts its prompt under **"Check first"**, **"Also worth checking"** or **"Other clauses found"**; the stage plan ([`lib/rules/src/stage-plans.ts`](lib/rules/src/stage-plans.ts)) then gives the order in which the five rule families sort the prompts inside each group. The interview's one question is the same at every stage; the compare stage adds one screen, **"What changed between the versions"**, and a way to skip straight to it.

<details>
<summary><b>Before signing</b> · an offer letter, rent agreement, NDA or loan you have been asked to sign</summary>

The app's words for it: *"An offer letter, rent agreement, NDA or loan you have been asked to sign. See what the document says you would be agreeing to, and what to ask before you do."* For example: a first job offer, or an NDA a client has sent over.

- **Family order inside each group:** duty → time → exit & remedies → money → data & IP.
- **Path:** upload → one optional question → document map → review prompts → preparation packet, with the questions to ask.
- **Sample to try:** *Employment offer letter*, the one in the [walkthrough](#demo-walkthrough-priya) below.

</details>

<details>
<summary><b>A problem started</b> · a dispute, notice or missed payment on an agreement you already signed</summary>

The app's words for it: *"A dispute, notice or missed payment on an agreement you already signed. Find the wording that talks about it and build a dated timeline of what happened."* For example: a landlord's message about leaving, or a deposit that has not come back.

- **Family order inside each group:** exit & remedies → time → money → duty → data & IP.
- **Path:** the same screens, with the exit & remedies and time families sorted first; the interview answer is scanned for safety cues here as everywhere, and a cue ends the document flow and shows the helplines instead.
- **Sample to try:** *Leave and licence (rent) agreement*.

</details>

<details>
<summary><b>Compare two versions</b> · an old and a new version of terms, a policy or a contract</summary>

The app's words for it: *"An old and a new version of terms, a policy or a contract. See what changed, clause by clause, in plain language."* For example: a subscription's updated terms, or a renewal with changed rent or fees.

- **Family order inside each group:** money → time → duty → exit & remedies → data & IP.
- **Path:** an older and a newer file → the question → map → prompts → **"What changed between the versions"** → packet. From the interview screen, **"Or go straight to what changed between the versions"** skips the map and prompts. Comparison is deterministic: no model call.
- **Samples to try:** *Leave and licence (rent) agreement* as the older version, *Leave and licence agreement, revised draft* as the newer.

</details>

## What it looks like

Every picture below is the app as built, taken from the sample documents by [`scripts/docs/screenshots.mjs`](scripts/docs/screenshots.mjs). Everything in them is synthetic: the documents, every name, amount and date in them, and the reader signed in through the offline stand-in; the one real date is the day the packet was prepared. The map, prompt and packet sentences are the model's output from that run, so a re-run words them differently.

<table>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/upload.webp" alt="The upload screen: the chosen sample offer letter as a file card, the retention notice, the consent tick box and the Continue button."><br><sub><b>Upload your document</b> · one file, or two versions to compare, pre-checked in the browser; how the document is handled is stated before anything is sent, and four synthetic samples are one press away.</sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/interview.webp" alt="The interview screen: the document card and one free-text question (Before the document: is there anything about your situation to say first?) with an answer typed in."><br><sub><b>Next: a few quick questions</b> · one optional answer about the situation, scanned for safety cues in the browser and never sent to the server.</sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/map.webp" alt="The document map: the heading, the document card, then the field Who is bound by it with two statements about the parties, each with a Show source control and a paragraph number."><br><sub><b>Your document map</b> · six fields plus the dates; each statement carries the paragraph it rests on.</sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/map-source-open.webp" alt="The same field with a statement's source open: the exact wording from the document, with its paragraph number."><br><sub><b>Show source</b> · the paragraph a statement rests on, quoted verbatim with its location; nothing the model wrote is shown without it.</sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/review.webp" alt="The review prompts screen: the group Check first opens with a duties-and-restrictions prompt about a non-compete clause, its source paragraph underneath."><br><sub><b>Your review prompts</b> · grouped into Check first, Also worth checking and Other clauses found by the rule's relevance at this stage; each prompt shows the clause and why it matters.</sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/packet.webp" alt="The preparation packet: a print-styled document headed Preparation packet, starting with what the document says and who is bound by it, and the print and download controls."><br><sub><b>Your preparation packet</b> · the map, the dates, the questions to ask, the records to gather and the citations, built in the browser; print, save as PDF or download as text.</sub></td>
  </tr>
</table>

<details>
<summary><b>More screens</b> · comparison, safety, official help, the stage question, the two-version upload, sign-in, a phone</summary>

<table>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/compare.webp" alt="The compare screen: a summary card counting the changes by kind, then the first change card with the older and newer wording side by side."><br><sub><b>What changed between the versions</b> · each change classified by kind (money, time, duty, remedy, wording) and each side quoted; no model call.</sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/safety.webp" alt="The safety screen: an emergency box headed If you are in danger now with a Call 112 button, followed by why the screen is shown."><br><sub><b>Your safety comes first</b> · a safety cue in the interview answer ends the document flow, clears what the browser held, asks the server to delete the session (the screen says whether that was confirmed) and shows the helplines.</sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/help.webp" alt="The official help page: what it is about, a set of situations to choose from, and the services that fit the chosen one."><br><sub><b>Official help you can contact</b> · the curated registry of official services, each entry sourced and dated, open without sign-in.</sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/welcome-choices.webp" alt="The stage question on the welcome screen with three cards: Before signing, A problem started, Compare two versions."><br><sub><b>What brings you here today?</b> · the three situations, each with what it is for and an example.</sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/upload-compare.webp" alt="The upload screen for the comparison stage with the older and newer version slots filled from the samples."><br><sub><b>Upload both versions</b> · an older and a newer file for the comparison stage.</sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/sign-in.webp" alt="The sign-in screen: the heading Sign in to open your document, three short notes on why, and a card with Continue with Google, an e-mail and password form and links to create an account or reset a password."><br><sub><b>Sign in to open your document</b> · the document journey is behind Firebase Authentication (Google, or e-mail and password); the welcome, help and safety screens stay open without it.</sub></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><img src="docs/screenshots/map-phone.webp" width="390" alt="The document map at phone width: the field Who is bound by it with its statements stacked in one column."><br><sub><b>On a phone</b> · the same document map at 390 pixels wide.</sub></td>
  </tr>
</table>

</details>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/welcome-dark.webp">
    <img src="docs/screenshots/welcome.webp" width="900" alt="The welcome screen: the ClauseCompass wordmark, the line Plain-language navigation for legal documents, a short description, the Choose your situation and Learn more buttons, and a photograph of documents and a compass.">
  </picture>
  <br>
  <sub>The welcome screen in the colour scheme your browser reports (light or dark): the app has a light and a dark theme of its own, chosen in its settings menu along with the language (English or Hinglish) and the text size.</sub>
</p>

<p align="right"><a href="#top">Back to top ↑</a></p>

## System architecture

Two services and a set of shared libraries in one pnpm workspace. The browser holds the journey; the API holds the document text for the life of a session and nothing longer; the model sees only the paragraphs selected for one map field or one family of review rules at a time, under a per-call cap.

```mermaid
flowchart TB
  subgraph browser["Browser · React 19 + Vite web client"]
    direction TB
    ui["Screens<br/>welcome · sign-in · upload · interview<br/>document map · review prompts · compare<br/>packet · safety · official help"]
    journey["Journey state + decision flow<br/>stage, session id, escalation in sessionStorage<br/>safety cues scanned here, in the browser<br/>files held in memory only"]
    ground["Claim resolver + packet builder<br/>statement → its chunk → verbatim excerpt<br/>packet: print, save as PDF, text file"]
    resources["Resource registry<br/>bundled JSON, no API call"]
  end

  subgraph api["API server · Express 5 · one process, memory only"]
    direction LR
    mw["Middleware<br/>request log → helmet → CORS (opt-in)<br/>→ per-client budgets → JSON ≤ 16 KiB<br/>→ requireUser: Firebase ID token, jose + JWKS"]
    gates["Admission gates<br/>32 uploads buffering<br/>2 extracting + 16 waiting<br/>4 analyses + 16 waiting<br/>8 model calls in flight"]
    store["Session store<br/>Map, at most 100 sessions<br/>sliding 30-minute TTL, sweeper<br/>chunks + prepared outputs<br/>never file bytes"]
    analysis["Analysis<br/>evidence selection: 34 clause rules,<br/>date + party detectors, version alignment<br/>→ model call: forced tool call, strict JSON schema<br/>→ grounding validator: one retry, else withheld"]
    mw --> gates --> store --> analysis
  end

  subgraph workers["Worker threads · one per document"]
    w["pdf.js · mammoth · plain text<br/>30 s and a 256 MB heap each<br/>caps: 10 MB, 50 pages, 30,000 words"]
  end

  fb["Firebase Authentication<br/>Google · e-mail and password"]
  jwks["Google public signing keys (JWKS)"]
  claude["Anthropic Messages API<br/>claude-haiku-4-5 by default"]

  browser -- "HTTPS /api · Authorization: Bearer ID token" --> api
  browser -- "sign-in, token refresh" --> fb
  api -. "verify tokens" .-> jwks
  api <-- "file bytes out, once · paragraphs with page, paragraph and clause label back" --> workers
  api -- "selected paragraphs only, capped per call" --> claude
```

### Components

<details>
<summary>Every component, its runtime, what it is responsible for and what it never does</summary>

| Component | Runtime | Responsibility | Never does |
| --- | --- | --- | --- |
| Web client (`artifacts/clausecompass`) | Browser; React 19, Vite 7, TypeScript, Tailwind CSS 4, wouter, TanStack Query | Stage choice, sign-in, upload pre-checks, the one interview question and its safety scan, rendering every statement next to its source, the packet, language/text-size/theme settings, read-aloud | Never sends the interview answer to the server; never renders a statement whose source chunk it cannot find; never holds a server secret |
| API server (`artifacts/api-server`) | Node 22.13+; Express 5, bundled with esbuild | Token verification, file admission, extraction in worker threads, the in-memory session store, deterministic evidence selection, the model call and its validator | Never stores uploaded bytes, never writes a document to disk or a database, never runs without a model configured |
| Extraction workers | `worker_threads`, one per document | pdf.js (PDF), mammoth (DOCX), plain text; paragraphs with page, paragraph number and printed clause label | Never runs longer than 30 s or past a 256 MB V8 heap; a crash takes down only its own thread |
| `lib/rules` | Shared, pure TypeScript | The versioned clause-rule registry (34 rules, five families), the rule engine, stage plans, the decision-flow state machine, safety cues, date parsing, clause labels | No I/O, no model |
| `lib/grounding` | Shared, pure TypeScript | Chunk and claim types, the model-output schema, the validator (citation, verbatim quote, prompt echo, responsible-language register), tokenisation and a BM25 retriever (built, not yet wired to a screen) | No I/O, no model |
| `lib/resources` + `data/resources` | Shared | The curated registry of official services, each entry with its source URL and last-checked date, and the routing that picks entries for a situation | Nothing fetched at runtime |
| `lib/api-spec` → `lib/api-zod`, `lib/api-client-react` | Build time | `openapi.yaml` is the contract; Orval generates the Zod schemas the server validates its successful responses with and the React Query hooks and types the browser calls with (over a small custom fetcher that adds the base path and the bearer token) | No hand-written request or response types on either side |
| Firebase Authentication | External | Google and e-mail/password sign-in in the browser; ID tokens the API verifies against Google's published keys with `jose` | Never sees the document; no Firebase code or service credential runs on the server |
| Anthropic Messages API | External | Restates selected paragraphs as a forced tool call against a strict JSON schema | Never sees more than the paragraphs selected for one call, the reader's identity or the interview answer |

</details>

Both services must share one origin in front of the reader (the web app calls `/api` on its own origin); in development the Vite dev server proxies `/api` to the API, and in production any static host or reverse proxy that serves the built bundle and forwards `/api` to the API process does the same. `CORS_ORIGINS` exists only for a split-origin deployment.

## How it works

Eight steps across four runtimes, pictured screen by screen in [What it looks like](#what-it-looks-like); the diagram below is generated from [`scripts/docs/architecture-diagram.mjs`](scripts/docs/architecture-diagram.mjs) and checked against the code. [docs/README.md](docs/README.md) maps each step to its files.

![ClauseCompass data flow: upload, validate and admit, extract, chunk and keep, select evidence, ask the model and validate, render, export or delete](docs/architecture.svg)

1. **Upload** (browser). Signing in comes first: the document journey is behind a Firebase Authentication sign-in (Google, or e-mail and password), so a session is opened for one reader and shown to nobody else; the welcome, help and safety screens stay open. Then one file, or an older and a newer version to compare. TXT, PDF and DOCX, pre-checked for type and size before the request is sent.
2. **Validate and admit** (API, `POST /api/sessions`). The bearer token first: every document and session route verifies the reader's Firebase ID token on the server (signature against Google's published keys, project, expiry) and stores the reader's id with the session; a request for someone else's session answers 404, and a delete of it does nothing. Then file name, size (10 MB), and the kind claimed by the extension against the first bytes of the file. An admission gate bounds how many uploads buffer, extract and wait at once; beyond it the answer is 503, not a queue.
3. **Extract** (a fresh worker thread per document, 30 s and 256 MB each). pdf.js for PDF, mammoth for DOCX. Caps: 30,000 words; for PDF also 50 pages. A PDF without a text layer (a scan) is refused with a message saying so.
4. **Chunk and keep.** One chunk per paragraph, each with its page, paragraph number and clause label where one is printed ("4.2", "Schedule I"). Chunks are the only thing a statement may cite. The session store is in-process memory: text and prepared outputs only, never the uploaded bytes; at most 100 sessions; a sliding 30-minute TTL and a sweeper.
5. **Select evidence** (deterministic, on demand, per screen). The rule registry picks paragraphs for the money, duties, termination and dispute fields and for the review prompts; a date detector builds the timeline; a party detector picks the paragraphs that name the parties. Comparison aligns the paragraphs of two versions and reports the differences by kind. No model is involved in this step.
6. **Ask the model and validate.** For each map field or family of rules that has evidence, one call to Claude (`claude-haiku-4-5` by default) through a forced tool call with a strict JSON schema; the model sees only the selected paragraphs and a fixed policy. The validator checks that each cited chunk exists, that the quote appears in it verbatim, that the sentence is not an echo of the prompt's own instructions, and that it is in a plain, non-judging register; the location shown is taken from the verified chunk, never from the model. One retry with the validator's feedback; a statement that still fails is withheld and counted. Timeline, comparison and background prompts never call the model.
7. **Render** (browser). Each statement is resolved to its chunk before it shows, with its paragraph (plus page and clause when known) and the verbatim excerpt one click away. Strings render as text, never as HTML. The interface is available in English and Hinglish, with text-size and light/dark theme settings and browser read-aloud.
8. **Export or delete.** The packet is built in the browser from the map and review results and printed (or saved as PDF) or downloaded as a text file; there is no export API. "Delete my document now" calls `DELETE /api/sessions/:id`, which drops the text and aborts any model call still running; otherwise the TTL does the same.

### One session, end to end

<details>
<summary>The sequence diagram: sign-in, upload, extraction, the model calls and their validation, the packet, the delete</summary>

```mermaid
sequenceDiagram
  autonumber
  actor R as Reader's browser
  participant FB as Firebase Authentication
  participant API as API server
  participant W as Worker thread
  participant M as Anthropic Messages API

  R->>FB: sign in (Google popup, or e-mail and password)
  FB-->>R: ID token (the SDK refreshes it)
  R->>API: POST /api/sessions · multipart stage + file · Authorization: Bearer ID token
  API->>API: verify token (jose, JWKS) · budgets · admission gate · name, size and magic-byte checks
  API->>W: file bytes → fresh thread (30 s, 256 MB)
  W-->>API: paragraphs with page · paragraph · clause label
  API->>API: keep the chunks in memory, drop the bytes
  API-->>R: 201 { id, expiresAt, documents[] }
  R->>R: interview answer scanned for safety cues (never sent to the server)
  R->>API: POST /api/sessions/:id/document-map
  API->>API: clause rules + date and party detectors pick paragraphs per field
  loop each of the six fields that has evidence
    API->>M: forced tool call · fixed policy + selected paragraphs only
    M-->>API: claims { text, quote, source_chunk_ids }
    API->>API: validator · chunk exists · quote verbatim · no prompt echo · plain register
    opt a claim fails
      API->>M: one retry carrying the validator's feedback
      M-->>API: revised claims (a claim that still fails is withheld and counted)
    end
  end
  API-->>R: map + timeline · every location taken from the chunk, not the model
  R->>API: POST /api/sessions/:id/review-prompts
  API-->>R: prompts by relevance · withheld count
  R->>R: packet built locally · print, save as PDF or download as text
  R->>API: DELETE /api/sessions/:id
  API->>API: drop the text · abort any model call still running
  API-->>R: 204
```

</details>

The map's six fields are prepared concurrently, each with its own model call; the review prompts make one call per rule family among the rules that are primary or secondary at the stage (split only if a family has more rules than one call carries). Both outputs are prepared once per session and served from memory afterwards, except an output prepared while the model was unavailable, which is not kept so that the next request tries again.

<p align="right"><a href="#top">Back to top ↑</a></p>

## User journey

Screen titles below are the ones the app shows. The document journey (`/upload` onwards) needs a signed-in reader; the welcome screen, the official-help page and the safety screen do not.

```mermaid
flowchart TD
  start([Open the app]) --> stage{"What brings you here today?"}
  stage -->|"Before signing"| gate
  stage -->|"A problem started"| gate
  stage -->|"Compare two versions"| gate
  start -.->|"no sign-in needed"| help["Official help you can contact<br/>Tele-Law, NALSA, helplines, SHe-Box"]
  gate{"Signed in?"} -->|no| signin["Sign in to open your document<br/>Google, or e-mail and password"] --> upload
  gate -->|yes| upload["Upload your document / Upload both versions<br/>one file, or an older and a newer version<br/>pre-checked in the browser: TXT / PDF / DOCX, at most 10 MB<br/>consent tick, then Continue"]
  upload -->|"POST /api/sessions"| session[("Session opened<br/>text extracted on the server, bytes dropped")]
  session --> interview["Next: a few quick questions<br/>one optional free-text answer"]
  interview --> scan{"Safety cue in the answer?<br/>scanned in the browser, never sent"}
  scan -->|yes| safety["Your safety comes first<br/>helplines · session deleted<br/>only way on: Start again from the beginning"]
  safety --> start
  scan -->|no| map["Your document map<br/>six fields + Dates in this document<br/>POST /api/sessions/:id/document-map"]
  interview -.->|"compare stage: Or go straight to what changed between the versions"| compare
  map --> review["Your review prompts<br/>Check first · Also worth checking · Other clauses found<br/>POST /api/sessions/:id/review-prompts"]
  review -->|"compare stage"| compare["What changed between the versions<br/>POST /api/sessions/:id/compare · no model call"]
  review -->|"other stages"| packet
  compare --> packet["Your preparation packet<br/>built in the browser<br/>Print or save as PDF · Download as a text file"]
  packet --> delete["Delete my document now<br/>DELETE /api/sessions/:id"]
  delete --> start
```

What the browser keeps: the stage, the session id and an escalation flag in `sessionStorage`; the chosen files in memory only; the prepared outputs in the query cache for the tab. A page reload therefore keeps the id but not the file, and the app deletes the orphaned session and asks for the document again rather than pretending to resume. Signing out deletes the open session first, then drops the identity.

## Decision flow

The flow that decides what happens next is an explicit state machine in [`lib/rules/src/flow.ts`](lib/rules/src/flow.ts), run in the browser, with no model anywhere in it. It reads two things: the stage the person chose and what the person typed. Everything the machine learns from the document arrives as typed data (a deadline date), never as free text, so an instruction planted inside a document cannot move it.

```mermaid
stateDiagram-v2
  state "awaiting-stage" as awaiting
  state "review" as review
  state "urgent-review" as urgent
  state "safety-escalation (absorbing)" as safety
  [*] --> awaiting
  awaiting --> review : stage chosen
  review --> urgent : a deadline within 7 days, or already passed
  awaiting --> safety : safety cue in what the person typed
  review --> safety : safety cue
  urgent --> safety : safety cue
  note right of safety
    analysis skipped, helplines shown, session deleted;
    only Start again from the beginning resets the flow
  end note
```

- **Stage plans and relevance.** Each rule in the registry says at which stages (`before-signing`, `problem-started`, `compare-versions`) it is primary or secondary; at any other stage it is background. Each stage's plan orders the five families and lists the outputs the stage needs. On the review screen that becomes "Check first", "Also worth checking" and "Other clauses found"; primary and secondary prompts are phrased by the model, background ones carry the registry's wording.
- **Safety cues.** The lexicon in [`lib/rules/src/safety-cues.ts`](lib/rules/src/safety-cues.ts) is about force or harm to a person, not about hard bargaining. A hit is absorbing: the document flow ends, the session is deleted, the helplines are shown, and the only way on is to start again.
- **What the model never decides.** Which screen comes next, which clauses are worth reviewing, which services are offered, whether a situation is urgent: all of it is data and code in `lib/rules` and `lib/resources`, covered by the unit and golden tests.

## Grounding: how a statement earns its place on screen

```mermaid
flowchart TD
  chunks[("Paragraph chunks<br/>id · text · page · paragraph · clause label")] --> select
  select["Select evidence for one field or rule family<br/>34 clause rules in five families<br/>at most 6 chunks / 7,000 characters per map field<br/>8 chunks / 10,000 characters per review batch"] --> any{"Any evidence?"}
  any -->|no| notfound["Not found in this document<br/>no model call"]
  any -->|yes| prompt["Prompt = fixed policy + the selected paragraphs, marked as data"]
  prompt --> modelcall["Anthropic Messages API<br/>forced tool call · strict JSON schema<br/>30 s timeout · at most 8 calls in flight"]
  modelcall -->|"unreachable, timeout, error"| degraded["Field falls back to the document's own words<br/>reason: model-unavailable · not cached, retried on the next request"]
  modelcall --> validate{"Validator, per claim<br/>cited chunk exists?<br/>quote verbatim in that chunk?<br/>not an echo of the prompt?<br/>plain, non-judging register?"}
  validate -->|pass| shown["Shown with the chunk's own location<br/>verbatim excerpt one click away"]
  validate -->|"fail, first time"| retry["One retry with the validator's feedback"] --> modelcall
  validate -->|"fail again"| withheld["Withheld and counted<br/>never repaired into an answer"]
  withheld -.->|"every claim of a field withheld"| wording["Field shows the located passages verbatim<br/>reason: nothing-verified"]
```

Three consequences of this design are visible in the product:

- **Two kinds of text, kept apart.** Model output is only ever a restatement of selected paragraphs, shown with the paragraph beside it. Everything else on the screen (field names, the registry's "why it matters" notes, comparison summaries, helplines) is product copy that ships with the code and goes through the same responsible-language lint the model's sentences do.
- **Degradation is honest.** A map field whose restatements all fail, or whose model call fails, shows the passages it located exactly as written under **"Shown in the document's own words"** and says why. A review prompt in the same situation carries the registry's own wording for that clause and says so (`phrasedBy: "template"`). The count of withheld statements is shown, not hidden.
- **Locations are never the model's.** The page, paragraph and clause shown with a statement are copied from the verified chunk, so the model cannot point at the wrong place.

<p align="right"><a href="#top">Back to top ↑</a></p>

## Request handling, limits and session lifecycle

Every request passes the same chain. The budgets, the session TTL and the model-call cap are environment-tunable (see [Setup](#setup)); the admission gates, the body limit and the file caps are constants in the code.

<details>
<summary>The middleware chain, as a diagram</summary>

```mermaid
flowchart LR
  req([Request]) --> log["request log<br/>request id · redacted URL"] --> helmet["helmet<br/>security headers"] --> cors["CORS<br/>only origins in CORS_ORIGINS"] --> budget["per-client budget<br/>600 / minute → 429 + Retry-After"] --> json["JSON body<br/>at most 16 KiB"] --> route{"/api route"}
  route -->|"/healthz · /sessions/policy"| open["no token needed"]
  route -->|"documents · sessions"| auth["requireUser<br/>Firebase ID token, else 401"] --> heavy["heavy budget<br/>60 / minute"] --> gate["admission gate<br/>uploads 32 · extraction 2 + 16 · analyses 4 + 16<br/>past it: 503 busy"] --> handler["handler"]
  handler --> err["errors as JSON<br/>{ error: { code, message } }<br/>no stack traces, no file contents"]
```

</details>

A session lives in the API process's memory from the upload until the reader deletes it or 30 idle minutes pass:

<details>
<summary>The session lifecycle, as a diagram</summary>

```mermaid
stateDiagram-v2
  [*] --> Open : POST /api/sessions → 201
  Open --> Open : any request that touches it slides the 30-minute window
  Open --> Deleted : DELETE /api/sessions/:id → 204 · text dropped, model calls aborted
  Open --> Expired : 30 idle minutes · refused on the next request
  Expired --> [*] : sweeper frees the memory (runs every minute)
  Deleted --> [*]
```

</details>

The store holds at most 100 sessions; a session belongs to the uid that opened it; another reader's read or analysis request for it is answered 404, exactly like an unknown or expired id, and a delete answers 204 either way, so ids cannot be probed. Delete aborts in-flight model calls through the session's abort signal.

## API

The contract is [`lib/api-spec/openapi.yaml`](lib/api-spec/openapi.yaml); the server validates every successful response against the Zod schemas generated from it, and the client's hooks and types are generated from the same file. All routes are under `/api`. Unless marked open, a route needs `Authorization: Bearer <Firebase ID token>`.

<details>
<summary>The nine routes</summary>

| Method and path | Purpose | Answers |
| --- | --- | --- |
| `GET /healthz` (open) | Liveness | `200 { status: "ok" }` |
| `GET /sessions/policy` (open) | The retention rule shown before anything is uploaded | `200 { ttlMinutes }` |
| `POST /sessions` | Multipart `stage` plus `file`, or `older` and `newer` for a comparison; extracts, keeps the paragraphs, discards the bytes | `201` session (`id`, `stage`, `ttlMinutes`, `expiresAt`, `documents[]`) |
| `GET /sessions/:id` | The session as it stands; touching it slides the TTL | `200` |
| `DELETE /sessions/:id` | Drop everything, abort in-flight model calls | `204` |
| `POST /sessions/:id/document-map` | Six fields with grounded claims, evidence ids and withheld counts, plus the timeline | `200` |
| `POST /sessions/:id/review-prompts` | One prompt per rule that fired, phrased by the model or by the registry template, grouped by relevance to the stage; rules that lead the stage but matched nothing under `notFound` | `200` |
| `POST /sessions/:id/compare` | Aligned paragraphs of the two versions with each difference classified (`money`, `time`, `duty`, `remedy`, `wording`; `changed`, `added`, `removed`); no model call | `200` |
| `POST /documents/extract` | Stateless extraction of one file; built and tested, not used by the client | `200` paragraphs |

</details>

Errors are always `{ error: { code, message } }` with a stable code and a message written for the person who uploaded the file: `400` for a refused file name or field, `401` without a valid token, `404` for a session that is unknown, expired or someone else's (on every session route but delete, which answers `204` regardless), `413` over 10 MB, `415` when the bytes do not match the claimed type, `422` for an encrypted, malformed or text-less document, `429` over budget (with `Retry-After`), `503` when a gate is full.

## Repository layout

<details>
<summary>The tree</summary>

```text
.
├── artifacts/
│   ├── clausecompass/          React 19 + Vite web client
│   │   └── src/
│   │       ├── pages/          welcome, sign-in, upload, interview, document-map, review-prompts,
│   │       │                   compare, packet, safety, official-help, not-found
│   │       ├── features/       auth, journey (state, copy in English and Hinglish), document (pre-checks,
│   │       │                   samples), analysis (query hooks), grounding (claim resolver, source card),
│   │       │                   packet, safety, resources, display (language, text size, theme), speech, seo
│   │       └── components/     shared UI
│   └── api-server/             Express 5 API, bundled with esbuild
│       └── src/
│           ├── routes/         health, documents, sessions (+ the three analyses)
│           ├── middlewares/    budgets, rate limit, extraction gate, JSON error handler
│           ├── auth/           Firebase ID-token verification (jose), offline stand-in
│           ├── uploads/        multipart handling, file-name rules
│           ├── extraction/     worker isolation, sniffing, limits, pdf / docx / txt, paragraphs
│           ├── sessions/       the in-memory store, TTL, sweeper
│           ├── analysis/       chunks, document map, dates, parties, review prompts, compare/
│           ├── llm/            prompt, claims, Anthropic adapter, concurrency, offline stand-in
│           └── lib/            config (validated at boot), logger, URL redaction
├── lib/
│   ├── rules/                  clause-rule registry, engine, stage plans, decision flow, safety cues, dates
│   ├── grounding/              chunk and claim types, validator, responsible-language table, retrieval
│   ├── resources/              typed access to data/resources with its routing
│   ├── api-spec/               openapi.yaml + Orval config (the contract)
│   ├── api-zod/                generated Zod schemas (server-side response validation)
│   ├── api-client-react/       generated React Query client (browser)
│   └── db/                     schema scaffold; nothing in the running product imports it
├── data/resources/             curated registry of official services (JSON, each entry sourced and dated)
├── samples/                    synthetic documents and interview answers used by the app and the tests
├── tests/                      cross-package suites: golden, adversarial, a11y, safety, resources, export
├── scripts/                    dev runner, test-layer reporter, accessibility runner, preflight, size and
│                               secret checks, architecture-diagram generator, screenshot script
├── docs/                       PRD, architecture diagram, screenshots, threat model, UI design spec and prompt blocks
├── .github/workflows/ci.yml    the preflight as GitHub's check on main, plus a dependency audit
├── SECURITY.md                 reporting path, guarantees, accepted risks
├── eslint.config.mjs           lint rules (ESLint 10 flat config)
└── .env.example                every variable, documented, with no secret values
```

</details>

Package boundaries: `lib/rules`, `lib/grounding` and `lib/resources` are pure TypeScript with no I/O, so the same code runs in the browser (decision flow, claim resolution, resource routing) and on the server (evidence selection, validation). The web client and the API talk to each other only through the generated contract packages; neither imports the other's code.

<p align="right"><a href="#top">Back to top ↑</a></p>

## Assumptions & limitations

- **Information, not advice.** The product describes what a document says and where. It does not say whether a clause is enforceable, what will happen, whether you qualify for a service, or what to do. The model is not allowed to either: the validator rejects conclusory sentences and the prompt forbids citing laws or judgments. Confirm eligibility and availability of any service with that service.
- **Documents.** Text-layer PDF, DOCX and TXT up to 10 MB; PDFs up to 50 pages; 30,000 words. No OCR, so scans and photographed pages are refused (PRD §3 keeps them out of the MVP because OCR errors are a safety risk here). The document itself is expected to be in English; the clause rules and date detector are written for English contract wording.
- **Language.** English and Hinglish are available for the interface copy. Document excerpts, the model's statements and the packet stay in English. Read-aloud uses the browser's own `en-IN` voice, so its quality depends on the device.
- **Sessions.** Memory only, on one server process: no database, no resume after a page reload (the session id is kept, but the browser deletes the orphaned session and asks for the file again). Sessions expire 30 minutes after their last use.
- **Model dependence.** The plain-language statements in the map and review prompts need the Anthropic Messages API. If it is unreachable, the map shows the located passages in the document's own words and the review prompts fall back to the registry's wording, each saying why; nothing is invented, and the server does not keep that output, so the next request for it tries again. Everything else (timeline, comparison, safety flow, helplines) works without it.
- **No free-text question answering.** Retrieval is rule-driven; there is no "ask anything about this document" box. A BM25 retriever exists in `lib/grounding` but nothing uses it yet.
- **Sign-in is identity, not persistence.** The account says whose session it is; it does not keep documents between visits, and the server decodes the ID token only to check it and keeps nothing about the reader but the uid. Sign-in needs the Firebase project's sign-in providers enabled and the serving domain in its authorized-domains list.
- **One process, in-memory limits.** The per-client request budgets, the analysis gate and the model-call cap all live in the server process, like the sessions; running several instances would give each its own budgets and split readers' sessions between them. Budgets are charged per client address, and which address that is depends on `TRUST_PROXY`: by default the socket's peer (forged forwarding headers are ignored, but every reader behind one proxy shares one budget); set to a hop count or, behind an edge proxy that rewrites the header, `true`, the forwarded address. Readers behind one shared address share one budget either way.

## Setup

Requirements: Node 22.13 or newer (the API start script uses `--env-file-if-exists`, which needs 22.9; ESLint 10 needs 22.13), pnpm 10 or newer, macOS, Linux or WSL (`pnpm dev` uses POSIX shell). The accessibility runner additionally needs a Chromium binary. No global installs, no database.

### Quick start

```sh
pnpm install
cp .env.example .env          # then put your ANTHROPIC_API_KEY and FIREBASE_PROJECT_ID in .env
cp artifacts/clausecompass/.env.example artifacts/clausecompass/.env   # the Firebase web config (VITE_FIREBASE_*)
pnpm dev                      # API http://localhost:8080/api/healthz, web http://localhost:5173
pnpm test                     # the whole suite, offline, ~40 s
```

Then open http://localhost:5173, choose a situation, sign in, and press **"Use this sample"** on one of the four synthetic documents: nothing needs to be downloaded.

### Running it without any keys

The tests and the accessibility run never touch Firebase or Anthropic: they use the offline stand-ins, and so can a development instance. Both stand-ins are refused when `NODE_ENV=production`.

```sh
AUTH_PROVIDER=mock LLM_PROVIDER=mock VITE_AUTH_PROVIDER=mock pnpm dev
```

**"Continue with Google"** then signs in a fictional reader at once, and the map and review prompts carry the stand-in model's placeholder sentences (each begins "Demo output (mock model, not analysis)") instead of restatements of the document; the rest (the rules, the dates, the comparison, the safety flow, the packet, the helplines) does not involve the model and runs unchanged. To see the model's real output without a Firebase project, set only `AUTH_PROVIDER=mock VITE_AUTH_PROVIDER=mock` and keep the Anthropic key in `.env`.

### Firebase

Sign-in needs a Firebase project with **Google** and **Email/Password** enabled under Authentication → Sign-in method, and `localhost` (plus any other domain the app is served from) under Authentication → Settings → Authorized domains. The web config values (`apiKey`, `authDomain`, `projectId`, `appId` from the Firebase console's web-app settings) go into `artifacts/clausecompass/.env`; they are public identifiers, not secrets. The tests and the accessibility run never touch Firebase: they use the offline stand-ins (`AUTH_PROVIDER=mock` on the API, `VITE_AUTH_PROVIDER=mock` in the client), which the server refuses in production.

### Build and production

`pnpm dev` builds and starts the API on 8080 and the Vite dev server on 5173 with `/api` proxied to the API. `pnpm build` type-checks everything and builds both services; the web build needs the same two variables the dev runner sets, so run it as `BASE_PATH=/ PORT=5173 pnpm build`. `pnpm typecheck` runs the checks alone. In production, run `node dist/index.mjs` in `artifacts/api-server` with the variables below in its environment and serve `artifacts/clausecompass/dist/public` from the same origin with `/api` forwarded to it.

### Environment variables

Read by the API server. The web client is configured at build time from `artifacts/clausecompass/.env`: the Firebase web config (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`) and, optionally, `VITE_SITE_URL` (the public address, for the canonical link, social metadata and sitemap), `VITE_FEEDBACK_URL` (a feedback link in the settings menu; without it the row is not shown) and `VITE_AUTH_PROVIDER=mock` (tests and the accessibility run only; refused by a production build); its dev server and build otherwise read `PORT`, `BASE_PATH` and the optional `API_PROXY_TARGET`, which `pnpm dev` sets.

<details>
<summary>The table: every variable the API server reads, whether it is required, its default and what it does</summary>

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | yes, unless the gateway pair below is set | – | Server-side only. A key set here always wins. |
| `AI_INTEGRATIONS_ANTHROPIC_BASE_URL`, `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | only as the alternative to a key | – | An Anthropic-compatible gateway (base URL plus the credential it expects); the adapter posts to `<base>/v1/messages` exactly as it does against `api.anthropic.com`. Used only when `ANTHROPIC_API_KEY` is unset; both must be present together. |
| `PORT` | yes | – | `pnpm dev` sets it (8080). |
| `FIREBASE_PROJECT_ID` | yes, unless `AUTH_PROVIDER=mock` | – | The Firebase project whose ID tokens the API accepts (`aud` and `iss` of every token). |
| `AUTH_PROVIDER` | no | `firebase` | `mock` accepts `mock:<uid>` bearer tokens for the tests and the accessibility run; refused when `NODE_ENV=production`. |
| `SESSION_TTL_MINUTES` | no | `30` | Sliding inactivity window, 1–1440. |
| `LLM_MODEL` | no | `claude-haiku-4-5` | Any Anthropic Messages API model id. |
| `LLM_PROVIDER` | no | `anthropic` | `mock` exists for the tests and the accessibility run; refused when `NODE_ENV=production`. |
| `ANTHROPIC_BASE_URL` | no | `https://api.anthropic.com` | Own-key mode only. HTTPS, or HTTP on localhost. |
| `LLM_MAX_CONCURRENT` | no | `8` | Model calls the process has in flight at once, 1–64; the rest wait their turn. |
| `RATE_LIMIT_PER_MINUTE` | no | `600` | Requests one client address may make per minute across `/api` (a token bucket: a minute's worth may be spent in a burst). `0` turns the budget off, as the offline test suite does. |
| `RATE_LIMIT_HEAVY_PER_MINUTE` | no | `60` | The same budget for the routes that cost a parser or a model: uploads and the three analyses. `0` turns it off. |
| `TRUST_PROXY` | no | `false` | Which forwarding headers decide the client address the budgets key on: `false` charges the socket peer and ignores `X-Forwarded-For`; a hop count (`1`–`16`) trusts that many proxies and charges the address the outermost appended; a list of addresses or CIDRs trusts those; `true` believes the header as sent, right only behind an edge proxy that rewrites it. |
| `CORS_ORIGINS` | no | – | Comma-separated browser origins (`https://app.example.org`) that may call the API from another origin. Unset, no cross-origin access is granted; the web app is served from the same origin as `/api`, so none is needed. |
| `LOG_LEVEL`, `NODE_ENV` | no | `info`, `development` | Logs carry request ids and redacted URLs, never file names or contents. |

</details>

The server validates all of this once at boot and refuses to start, naming every variable at fault, when any is missing or malformed. Nothing secret is committed: `.env` is git-ignored, `.env.example` holds names and non-secret defaults, the key never leaves the server, and `pnpm check:client-secrets` fails the build if a secret name or an Anthropic key prefix appears in the client source or bundle.

<p align="right"><a href="#top">Back to top ↑</a></p>

## Demo walkthrough (Priya)

Sample documents live in [`samples/`](samples/) and are synthetic: every company, person, address, amount and date in them is fictional. Priya's document is `samples/offer-letter-synthetic.txt`, a first job offer from a Bengaluru software company with probation, a training bond, a 60-day notice period, a non-compete and an acceptance deadline. Nothing needs to be downloaded; the sample is offered inside the app. The screens are pictured in [What it looks like](#what-it-looks-like).

1. Open the app. Under **"What brings you here today?"** choose **"Before signing"**. The first time, **"Sign in to open your document"** appears: **"Continue with Google"**, or an e-mail and password (**"New here? Create an account"** makes one). Afterwards the header shows who is signed in and a **"Sign out"** control.
2. On **"Upload your document"**, scroll to **"No document handy? Try a sample"** and press **"Use this sample"** on *Employment offer letter*. Tick **"I have read how my document is handled, and I want to continue."** and press **"Continue"**. The upload and extraction happen in this step.
3. **"Next: a few quick questions"** asks one optional question about her situation. Priya can leave it empty and press **"Continue to the document map"**. (Whatever is typed here is scanned for safety cues in the browser and is never sent to the server. To see the safety path, use one of the answers under **"Try a sample answer"**; the app shows **"Your safety comes first"** with the helplines and the only way on is **"Start again from the beginning"**.)
4. **"Your document map"** shows six fields: **"Who is bound by it"**, **"How long it lasts"**, **"Money"**, **"Duties and restrictions"**, **"How it can end"**, **"If there is a dispute"**, then **"Dates in this document"**, the timeline. Open a statement's source: the paragraph is quoted verbatim with its location. Switch **"Language"** to **"Hinglish"** and back, and try **"Larger text"**, on any screen.
5. **"Continue to the review prompts"**. **"Your review prompts"** are grouped into **"Check first"**, **"Also worth checking"** and **"Other clauses found"**. For this letter they include the training bond, the 60-day notice period and the non-compete, each with the clause it came from and why it matters before signing.
6. **"Continue to your preparation packet"**. **"Your preparation packet"** collects the summary, the dates, the questions to ask, the records to gather and the citations, with the official-help page linked below it. **"Print or save as PDF"** or **"Download as a text file"**.
7. Press **"Delete my document now"** in the footer. The session is gone from the server and the app returns to the start.

Second beat, comparison: choose **"Compare two versions"** on the first screen, load *Leave and licence (rent) agreement* into the **"Older version"** slot and *Leave and licence agreement, revised draft* into **"Newer version"** using the same sample buttons, continue, and **"What changed between the versions"** lists what changed between the drafts (a higher late fee, two months' notice instead of one, deposit forfeiture, new pets and parking clauses, one clause dropped), each side quoted. Comparison is deterministic and makes no model call; from the interview screen, **"Or go straight to what changed between the versions"** skips the map and prompts.

## Evaluation evidence

### Tests

One command, offline, no browser, no API key:

```sh
pnpm test
```

Last run on 17 September 2026: 77 files, 922 tests, all passing in about 50 s, reported by layer as PRD §12 asks:

| Layer | What it proves |
| --- | --- |
| Golden documents (7 files, 69 tests) | Exact clause hits, dates and escalation states for the three synthetic documents and the two-version pair; the whole pipeline over HTTP against the mock model. |
| Adversarial (9 files, 105 tests) | Prompt injection inside documents, XSS payloads, hostile files (zip bombs, wrong magic bytes, path-like names), safety-escalation routing, route guards (a signed-out or step-skipping reader is redirected, a foreign `next` address is refused), a second reader on the same browser, a double-pressed sign-in: the policy does not change, no unsourced statement or verdict is rendered, nothing leaks across readers, nothing crashes. |
| Accessibility (6 files, 34 tests) | Route focus and document titles, the header's settings menu (language, text size, theme, open/close from the keyboard), the loading state of a slow screen, the sign-in screen, read-aloud reading order (DOM-level). |
| Schema (6 files, 63 tests) | Malformed model output, unknown chunk ids, missing or altered quotes, verdict wording, the model-call cap: the validator rejects and the request degrades, never throws. |
| Integration (13 files, 166 tests) | Uploads and extraction for PDF, DOCX and TXT, admission gate, per-client budgets, response headers, session lifetime and delete, packet export, simulated API errors: nothing leaks file contents or secrets. |
| Unit (36 files, 485 tests) | Rule matching for every family, date parsing, clause alignment, decision-flow transitions, language lint, resource registry, the client's file check and sample loader. |

`pnpm test:coverage` runs the same suite under V8 coverage over the product code (both services and the libraries; tests, test helpers and the offline stand-ins excluded) and writes an HTML report to `coverage/`. On 17 September 2026: 86.9% of statements, 79.2% of branches, 88.4% of lines. No threshold is enforced; the per-layer table is the gate, the coverage report is where to look for what it does not reach.

Details, including how to run one layer, are in [tests/README.md](tests/README.md).

### Accessibility

- `pnpm a11y` drives three keyboard-only journeys (single document, comparison, helplines and safety) through the real app in headless Chromium with the mouse disabled: on every screen state it records the Tab order, checks that each stop has an accessible name, is on screen and shows a focus indicator, and runs axe-core (WCAG 2.0–2.2 A and AA plus best practice) in light and dark mode. Last full run on 17 September 2026: 27 screen states, 0 findings. Not automated yet: a 200% zoom pass and a real screen-reader run. Every journey can be completed with <kbd>Tab</kbd>, <kbd>Shift</kbd>+<kbd>Tab</kbd>, <kbd>Enter</kbd>, <kbd>Space</kbd> and the arrow keys alone.
- In the product: a skip link, focus moved to the page heading on every route change, live regions where content changes without a navigation, English and Hinglish copy, text size from 100% to 150% (persisted), browser read-aloud with a stop control, `prefers-reduced-motion` respected, and colour tokens chosen for at least 4.5:1 text contrast in both schemes (the per-family hues are at least 5:1).

### Security controls

[SECURITY.md](SECURITY.md) has the reporting path, the guarantees in one page and the accepted risks; [docs/threat-model.md](docs/threat-model.md) has the assets, trust boundaries and the guarantee each control upholds, with the test that pins it. The controls:

<details>
<summary>The controls, grouped: input, isolation, identity, retention, model boundary, output, secrets, budgets, transport</summary>

- **Input.** File names with path separators or control characters are refused (400); files over 10 MB (413); files whose bytes do not match the claimed type (415); encrypted, malformed or text-less documents (422). DOCX archives are inflated under an entry and size budget before they are opened.
- **Isolation.** Every document is parsed in a fresh worker thread with a 30-second timeout and a 256 MB heap, so a crashing parser takes down only its own worker. The process's resident memory is watched while workers run; under pressure every running extraction is stopped and answered with an error instead of the server dying. An admission gate (32 uploads buffering, 2 extracting, 16 waiting) answers 503 instead of queueing without bound.
- **Identity.** Every document and session route needs a Firebase ID token, verified on the server with a JWT library against Google's published signing keys (issuer and audience pinned to the project, RS256 only, expiry enforced); no Firebase code or service-account credential runs on the server. A session belongs to the uid that opened it; another reader's read or analysis request for it is a 404 and a delete answers 204 either way, so session ids cannot be probed, and only the owner's delete does anything. Sign-out asks the server to delete the open session before the identity is dropped (if that call fails the session is unreachable anyway and expires on its own).
- **Retention.** Uploaded bytes are never stored; only extracted text and prepared outputs live in memory, until the user deletes them or 30 idle minutes pass (an expired session is refused on the next request and its memory is freed by a sweep that runs every minute, so the bytes are gone within 31 minutes of the last use). Delete aborts in-flight model calls. No database, no analytics, no third-party scripts in the page; fonts ship with the bundle, so the only external requests the browser makes are to Firebase Authentication for sign-in and token refresh (which never sees the document).
- **Model boundary.** The prompt marks document excerpts as data, not instructions; the model can only return a tool call matching a strict schema; the validator rejects unknown citations, altered quotes, echoes of the prompt and conclusory language, and a failed statement is withheld rather than repaired into an answer. The model sees only the paragraphs selected for one field or one review batch, under a per-call cap.
- **Output.** Every string is rendered as text; the adversarial suite plants script payloads in documents and checks that none executes. API errors are stable `{ error: { code, message } }` objects with no stack traces or file content; request logs carry redacted URLs and no file names.
- **Secrets.** The API key is read on the server only; `pnpm check:client-secrets` scans the client source and production bundle for secret names and key prefixes and fails on a match. The Firebase web config in the client is not a secret (it identifies the project; the project's authorized domains and providers are the control), and the server needs no Firebase credential at all.
- **Budgets.** Every `/api` request is charged to its client address before anything is read (600 a minute; uploads and analyses also count against 60 a minute), and an over-budget request is answered 429 with `Retry-After`. Analyses run at most 4 at a time process-wide with 16 waiting (503 `busy` past that), and the process never has more than 8 model calls open at once, so a burst of readers is bounded in memory, parser time and model spend. The budgets and the model-call cap are environment-tunable (table above), the analysis gate is a constant; which address a request is charged to is `TRUST_PROXY`'s decision (socket peer by default, so a forged forwarding header buys nothing).
- **Transport.** Every response carries the standard hardening headers (`helmet`: no content sniffing, no framing, `no-referrer`, HSTS, a default CSP, same-origin resource policy). No cross-origin access is granted unless `CORS_ORIGINS` names the origins; the web app shares the API's origin, so by default none is. JSON bodies stop at 16 KiB; documents travel as multipart under their own cap. The stand-in model and sign-in providers are refused in production.

</details>

### Preflight before a submission attempt

Submission attempts are limited, so run the same checks before each one, on `main`, the branch the submission repository is pushed from (keep it the only branch there; no long-lived feature branches):

```sh
pnpm preflight
```

That is `scripts/preflight.sh`: `pnpm build` (the strict type check over every package, then both bundles), `pnpm lint` (ESLint over every package, test and script: the core rules, the TypeScript rule set, the rules of React hooks and the static accessibility rules for JSX; `eslint.config.mjs`), `pnpm test`, `pnpm check:client-secrets` and `pnpm check:size`, in that order, stopping at the first failure (the size ceiling comes last so that a payload over it can never hide a secret in the bundle). GitHub runs the same five steps on every push and pull request to `main` on Node 22 and 24 ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)), plus `pnpm audit` (high and critical) as its own job, so a new advisory fails on its own line while the preflight jobs still say whether the code builds and passes. Last full preflight on 17 September 2026: build, type check and lint clean, 922 tests passing, no secret names or key patterns in the source, the client bundle or any commit, no `.env` or real document ever committed; the payload was about 5.1 MB across some 460 files, which is over the internal ceiling described next (see the note there).

`pnpm check:size` sums every tracked and unignored file and fails above 3 MiB, an internal ceiling well under the 10 MB submission limit; `samples/real/` and `attached_assets/` are git-ignored so real documents cannot be committed by accident. Fixtures are text and JSON only. The ceiling started at 2 MiB and moved once, to 3 MiB, on 15 September; on 17 September the payload passed it (about 5.1 MB: the README's screenshots and journey animation, about 1.5 MB together, the lockfile, the hero photograph and the design prompt blocks its largest files) and the check fails until the ceiling is moved again or the tree is trimmed.

<p align="right"><a href="#top">Back to top ↑</a></p>

## FAQ

<details>
<summary><b>Is this legal advice?</b></summary>

No. The product describes what a document says and where. It does not say whether a clause is enforceable, what will happen, whether you qualify for a service, or what to do, and the model is not allowed to either: the validator rejects conclusory sentences and the prompt forbids citing laws or judgments. The packet is made to be carried to a lawyer or a free legal-aid service, and the help screen lists the official ones.

</details>

<details>
<summary><b>Where does my document go?</b></summary>

To the API server, once, as bytes that are parsed in a worker thread and then dropped. What stays is the extracted text and the prepared outputs, in the server process's memory, until you press "Delete my document now" or 30 idle minutes pass. No database, no analytics, no third-party scripts in the page; fonts ship with the bundle, so the only external requests the browser makes are to Firebase Authentication for sign-in and token refresh, which never sees the document.

</details>

<details>
<summary><b>What does the AI model see, and what can it not do?</b></summary>

For each map field or rule family that has evidence, it sees a fixed policy and the paragraphs selected for that call, marked as data, under a per-call cap, and neither the reader's identity nor the interview answer. It can only reply with a tool call matching a strict schema, and every sentence it returns is checked: the cited paragraph exists, the quote is in it verbatim, the sentence is not an echo of the prompt, and it is in a plain, non-judging register. One retry with the validator's feedback; then the sentence is withheld and counted, never repaired into an answer.

</details>

<details>
<summary><b>What happens when the model is unreachable?</b></summary>

The map shows the passages it located in the document's own words under "Shown in the document's own words" and says why; the review prompts fall back to the registry's wording for each clause and say so. Nothing is invented, and that output is not kept, so the next request tries again. The timeline, the comparison, the safety flow and the helplines never needed the model.

</details>

<details>
<summary><b>Why do I have to sign in?</b></summary>

So that a session is opened for one reader and shown to nobody else: every document and session route checks the Firebase ID token on the server, and a request for someone else's session answers 404. The account is identity, not persistence: it does not keep documents between visits, and the server keeps nothing about the reader but the uid. The welcome, help and safety screens stay open without it.

</details>

<details>
<summary><b>Can I upload a scan or a photo of a document?</b></summary>

Not in this version. There is no OCR, so a PDF without a text layer is refused with a message saying so; PRD §3 keeps scans out of the MVP because OCR errors are a safety risk here.

</details>

<details>
<summary><b>Can I use it in Hindi?</b></summary>

The interface copy is available in English and Hinglish, from the settings menu on any screen. Document excerpts, the model's statements and the packet stay in English, and the clause rules are written for English contract wording. Read-aloud uses the browser's own `en-IN` voice.

</details>

<details>
<summary><b>Can I ask it a question about my document?</b></summary>

No. Retrieval is rule-driven, not free-text search: the clause rules and the date and party detectors decide which paragraphs are shown. A BM25 retriever exists in `lib/grounding` but nothing uses it yet.

</details>

<details>
<summary><b>Can I run it without any API keys?</b></summary>

In development, yes: see [Running it without any keys](#running-it-without-any-keys). The stand-in sign-in and stand-in model are refused when `NODE_ENV=production`, and the stand-in model's sentences are placeholders, not analysis.

</details>

## Documentation

| Document | What it holds |
| --- | --- |
| [docs/PRD.md](docs/PRD.md) | The product requirements this build follows; section numbers in code comments point here |
| [docs/README.md](docs/README.md) | The architecture diagram with each step mapped to its files |
| [docs/threat-model.md](docs/threat-model.md) | Assets, trust boundaries, threat categories and the control (and test) for each |
| [docs/design.md](docs/design.md) | The UI design specification: tokens, component recipes, every screen and its states, copy and accessibility rules |
| [docs/design-prompts.md](docs/design-prompts.md) | The same specification as copy-paste prompt blocks for handing the UI to another builder |
| [SECURITY.md](SECURITY.md) | Vulnerability reporting, the guarantees in one page, accepted risks |
| [tests/README.md](tests/README.md) | The test layers, how to run one, the last full-run counts |
| [samples/README.md](samples/README.md) | What each synthetic document contains and which tests pin it |
| [data/resources/README.md](data/resources/README.md) | How registry entries are sourced, dated and checked |
| [docs/screenshots/](docs/screenshots/) | The screens above, taken from the sample documents by [`scripts/docs/screenshots.mjs`](scripts/docs/screenshots.mjs) against a development instance running the offline sign-in stand-in |

<p align="center"><sub>Built for Hack2Skill 2026 · <a href="#top">Back to top ↑</a></sub></p>
