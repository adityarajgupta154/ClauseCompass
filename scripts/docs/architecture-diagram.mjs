// Draws docs/architecture.svg: the data flow of ClauseCompass as built.
//
// The text in the boxes is checked against the code by hand (see
// docs/README.md for the file map); rerun with `node
// scripts/docs/architecture-diagram.mjs` after changing it. No dependencies:
// the layout is a few boxes on a grid, so the SVG is written directly.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../../docs/architecture.svg", import.meta.url));

// Ink-and-paper tokens from artifacts/clausecompass/src/index.css (light scheme), as hex.
const PAPER = "#FCFBF8";
const INK = "#1D2634";
const MUTED = "#4B515F";
const BORDER = "#DEDAD3";
const CARD = "#FFFFFF";
const PRIMARY = "#B4472A"; // terracotta: the API
const TIME = "#294F99"; // blue: the browser
const MONEY = "#246644"; // green: the worker thread
const DUTY = "#633F8D"; // purple: the model

const SERIF = `Lora, Georgia, 'Times New Roman', serif`;
const SANS = `'DM Sans', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;

const W = 1440;
const H = 1190;
const BOX_W = 300;
const COL = [60, 400, 740, 1080]; // left edges of the four columns
const LINE = 16;
/** Box height for a body of n lines: title and subtitle, the lines, and a little room under the last one. */
const heightFor = (n) => 70 + (n - 1) * LINE + 16;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const parts = [];
const add = (s) => parts.push(s);

/** A lane band with its label at the top left. */
function band(x, y, w, h, fill, label) {
  add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}"/>`);
  add(
    `<text x="${x + 20}" y="${y + 20}" class="b" font-size="11" font-weight="600" letter-spacing="1.6" fill="${MUTED}">${esc(label.toUpperCase())}</text>`,
  );
}

/** A numbered step box: title, a muted subtitle, then body lines. */
function box({ x, y, h, n, color, title, sub, lines }) {
  add(`<rect x="${x}" y="${y}" width="${BOX_W}" height="${h}" rx="8" fill="${CARD}" stroke="${color}" stroke-width="1.5"/>`);
  let tx = x + 16;
  if (n !== null) {
    add(`<circle cx="${x + 26}" cy="${y + 24}" r="12" fill="${color}"/>`);
    add(`<text x="${x + 26}" y="${y + 28.5}" text-anchor="middle" class="b" font-size="13" font-weight="700" fill="#fff">${n}</text>`);
    tx = x + 46;
  }
  add(`<text x="${tx}" y="${y + 29}" class="t" font-size="16" font-weight="700" fill="${INK}">${esc(title)}</text>`);
  add(`<text x="${x + 16}" y="${y + 48}" class="b" font-size="11" font-style="italic" fill="${MUTED}">${esc(sub)}</text>`);
  const body = lines.map((line, i) => `<tspan x="${x + 16}" dy="${i === 0 ? 0 : LINE}">${esc(line)}</tspan>`).join("");
  add(`<text x="${x + 16}" y="${y + 70}" class="b" font-size="12" fill="${INK}">${body}</text>`);
}

/** An arrow along the given points (polyline), solid or dashed, optionally two-headed. */
function arrow(points, { dashed = false, both = false } = {}) {
  const d = points.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px} ${py}`).join(" ");
  add(
    `<path d="${d}" fill="none" stroke="${MUTED}" stroke-width="1.6"${dashed ? ` stroke-dasharray="6 5"` : ""} marker-end="url(#head)"${both ? ` marker-start="url(#head)"` : ""}/>`,
  );
}

function label(x, y, text, { anchor = "start", size = 11, weight = 500 } = {}) {
  add(`<text x="${x}" y="${y}" text-anchor="${anchor}" class="b" font-size="${size}" font-weight="${weight}" fill="${MUTED}">${esc(text)}</text>`);
}

// ---------------------------------------------------------------------------

add(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="title desc">`);
add(`<title id="title">ClauseCompass — data flow as built</title>`);
add(
  `<desc id="desc">Eight numbered steps across four lanes (browser, API, worker thread, model): upload, validate and admit, extract, chunk and keep, select evidence, ask the model and validate, render, export or delete. Notes list where the build differs from PRD section 7.2.</desc>`,
);
add(`<style>.t{font-family:${SERIF}}.b{font-family:${SANS}}</style>`);
add(`<defs><marker id="head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0.5 L10 5 L0 9.5 z" fill="${MUTED}"/></marker></defs>`);
add(`<rect width="${W}" height="${H}" fill="${PAPER}"/>`);

// Header
add(`<text x="60" y="52" class="t" font-size="27" font-weight="700" fill="${INK}">ClauseCompass — how a document moves through the system</text>`);
add(
  `<text x="60" y="78" class="b" font-size="13" fill="${MUTED}">The data flow of PRD §7.2 as implemented, checked against the code on 17 September 2026. Solid arrows carry a request or its data; the dashed arrow is deletion.</text>`,
);

// Lanes
const BH = heightFor(8);
const AH = heightFor(11);
const LH = heightFor(6);
const BROWSER = { y: 104, h: 42 + BH + 16 };
const API = { y: 104 + 42 + BH + 16 + 10, h: 40 + AH + 16 };
const LOWER = { y: 104 + 42 + BH + 16 + 10 + 40 + AH + 16 + 30, h: 36 + LH + 14 };
band(40, BROWSER.y, 1360, BROWSER.h, "#FFFFFF", "Browser · React 19 + Vite · artifacts/clausecompass");
band(40, API.y, 1360, API.h, "#F7F2EA", "API · Express 5, one Node process, memory only · artifacts/api-server");
band(40, LOWER.y, 680, LOWER.h, "#EDF3EE", "Worker thread · one per document · extraction/isolated.ts");
band(740, LOWER.y, 660, LOWER.h, "#F1EDF6", "Model · Anthropic Messages API · llm/anthropic.ts");

// Boxes — browser lane
const BY = BROWSER.y + 42;
box({
  x: COL[0], y: BY, h: BH, n: 1, color: TIME,
  title: "Upload", sub: "/upload · the welcome screen picked the stage",
  lines: [
    "sign-in first (Firebase Auth: Google or e-mail);",
    "the ID token rides on every API call as a bearer",
    "one file, or an older + newer pair to compare",
    "TXT · PDF · DOCX, pre-checked for type and size",
    "then /interview: one optional free-text answer,",
    "screened for safety cues in the browser, never sent",
    "sessionStorage keeps only the session id, stage",
    "and any escalation; a reload needs a fresh upload",
  ],
});
box({
  x: COL[2], y: BY, h: BH, n: 7, color: TIME,
  title: "Render", sub: "/map · /review · /compare",
  lines: [
    "each statement resolves to its chunk before",
    "it shows; otherwise “Not shown”, never the text",
    "every statement names its paragraph (plus page",
    "and clause when known) and opens to the excerpt",
    "strings render as text — no raw HTML",
    "English / Hinglish copy, text size, read-aloud",
  ],
});
box({
  x: COL[3], y: BY, h: BH, n: 8, color: TIME,
  title: "Export · Delete", sub: "/packet",
  lines: [
    "packet built in the browser from the map and",
    "review results (prepared first if not cached)",
    "→ print to PDF or a .txt download; no export API",
    "Delete → DELETE /api/sessions/:id, then the",
    "client cache is cleared; a safety escalation",
    "deletes too. Otherwise the TTL sweeper does.",
  ],
});

// Boxes — API lane
const AY = API.y + 40;
box({
  x: COL[0], y: AY, h: AH, n: 2, color: PRIMARY,
  title: "Validate & admit", sub: "POST /api/sessions · auth/, uploads/, middlewares/",
  lines: [
    "per-address budget first: 600/min, uploads and",
    "analyses 60/min → 429 with Retry-After",
    "bearer token verified (jose, Google's JWKS,",
    "project as aud/iss) → 401; the session takes its uid",
    "file name: no paths or control chars → 400",
    "> 10 MiB → 413; kind from extension / MIME must",
    "match the bytes: %PDF · ZIP with",
    "word/document.xml · text without NUL → 415",
    "admission gate: 32 buffered · 2 extracting",
    "· 16 waiting, else 503 busy",
    "encrypted / malformed / empty / no text → 422",
  ],
});
box({
  x: COL[1], y: AY, h: AH, n: 4, color: PRIMARY,
  title: "Chunk & keep", sub: "analysis/chunks.ts · sessions/store.ts",
  lines: [
    "one chunk per paragraph: p1 … pn, each with",
    "{ page, paragraph, clause label }",
    "chunks are the only citation targets",
    "store: ≤ 100 sessions, sliding TTL",
    "(SESSION_TTL_MINUTES, default 30) + sweeper",
    "keeps text and prepared outputs, never bytes",
    "one process, no shared store; delete aborts",
    "any model call still in flight",
  ],
});
box({
  x: COL[2], y: AY, h: AH, n: 5, color: PRIMARY,
  title: "Select evidence", sub: "on demand, per screen · deterministic · analysis/",
  lines: [
    "clause-rule registry (5 families; regex",
    "any / all / none; stage-aware) → review rules",
    "and the money, duties, termination, dispute fields",
    "dates: date detector + registry hits → field",
    "and timeline · parties: party detector",
    "compare: paragraph alignment + diff, phrased",
    "per kind — no model anywhere in this step",
    "the model will see only the selected paragraphs",
  ],
});
box({
  x: COL[3], y: AY, h: AH, n: 6, color: PRIMARY,
  title: "Ask the model & validate", sub: "llm/claims.ts · lib/grounding validate.ts",
  lines: [
    "analyses 4 running · 16 waiting, else 503 busy;",
    "≤ 8 model calls in flight process-wide",
    "one forced tool call, strict JSON schema, short",
    "max_tokens; the model only restates excerpts",
    "validator: cited chunk exists · quote found",
    "verbatim in it · location taken from the chunk",
    "· no echo of the prompt · plain, non-judging",
    "register (Responsible Language lint)",
    "fail → one retry with feedback → still bad →",
    "statement withheld and counted; background",
    "prompts use registry templates: no call",
  ],
});

// Boxes — lower lanes
const LY = LOWER.y + 36;
box({
  x: 230, y: LY, h: LH, n: 3, color: MONEY,
  title: "Extract", sub: "extraction/ · worker.ts · pdf.ts · docx.ts · txt.ts",
  lines: [
    "TXT · PDF via pdf.js · DOCX via mammoth",
    "30 s timeout · 256 MB heap · RSS watch →",
    "too-complex if the parser misbehaves",
    "caps: 30k words; PDF also 50 pages, 250k chars",
    "PDF lines → paragraphs with page numbers;",
    "the raw bytes are dropped after this step",
  ],
});
box({
  x: COL[3], y: LY, h: LH, n: null, color: DUTY,
  title: "Claude (LLM_MODEL)", sub: "default claude-haiku-4-5 · provider chosen by config",
  lines: [
    "tool_choice forced → the reply is the tool's",
    "JSON input, checked locally, never trusted",
    "receives the selected paragraphs, the task",
    "line and the fixed policy — nothing else",
    "mock provider exists for tests and audit only",
  ],
});

// Arrows
const mid = (b) => b + BOX_W / 2;
arrow([[210, BY + BH], [210, AY]]); // 1 → 2
label(222, BY + BH + 20, "POST /api/sessions (multipart)");
arrow([[280, AY + AH], [280, LY]]); // 2 → 3
label(292, AY + AH + 28, "bytes");
arrow([[480, LY], [480, AY + AH]]); // 3 → 4
label(492, AY + AH + 28, "text + page / paragraph");
arrow([[COL[1] + BOX_W, AY + 88], [COL[2], AY + 88]]); // 4 → 5
arrow([[COL[2] + BOX_W, AY + 88], [COL[3], AY + 88]]); // 5 → 6
arrow([[1230, AY + AH], [1230, LY]], { both: true }); // 6 ↔ model
label(1242, AY + AH + 12, "one call per map field or");
label(1242, AY + AH + 25, "rule batch with evidence,");
label(1242, AY + AH + 38, "concurrently; one retry each");
arrow([[760, BY + BH], [760, AY]]); // 7 → 5 (prepare)
label(772, BY + BH + 20, "POST /api/sessions/:id/");
label(772, BY + BH + 33, "document-map · review-prompts · compare");
arrow([[1130, AY], [1130, API.y - 4], [1010, API.y - 4], [1010, BY + BH]]); // 6 → 7 (response)
label(1142, API.y - 9, "statements: text, quote, chunk id, location");
add(`<path d="M1010 ${AY} L1010 ${API.y - 4}" fill="none" stroke="${MUTED}" stroke-width="1.6"/>`); // 5 → 7 joins the response
label(998, AY - 12, "timeline · compare · evidence: no model", { anchor: "end" });
arrow([[COL[2] + BOX_W, BY + 76], [COL[3], BY + 76]]); // 7 → 8
arrow([[mid(COL[3]), BY], [mid(COL[3]), BROWSER.y + 22], [520, BROWSER.y + 22], [520, AY]], { dashed: true }); // 8 → store (delete)
label(534, BROWSER.y + 18, "DELETE /api/sessions/:id — the server drops the text and outputs and aborts any model call in flight; the sweeper does the same at TTL");

// Notes
const NY = LOWER.y + LOWER.h + 34;
add(`<text x="60" y="${NY}" class="t" font-size="17" font-weight="700" fill="${INK}">Where the build differs from PRD §7.2</text>`);
const notes = [
  ["Extraction runs inside POST /api/sessions: the client never calls a separate extract step (a stateless POST /api/documents/extract", "exists, unused by the client). Only text and coordinates are kept; the uploaded bytes never reach the store."],
  ["Retrieval is rule-driven, not free-text search. BM25 retrieval (lib/grounding) and chunk-level instruction flags (lib/rules) are built and", "tested but not wired to any screen yet; there is no Q&A endpoint. The prompt marks excerpts as data and the validator rejects echoes of the prompt."],
  ["Timeline, parties, compare and all evidence selection are deterministic; the model only restates chosen excerpts. A statement that fails", "validation is withheld and counted, not repaired into an answer."],
  ["Export is a browser print / text download, always in English, not a server-rendered packet. The interview and safety decision flow run", "entirely in the browser; a safety escalation asks the server to delete the session."],
  ["The TTL is a sliding inactivity window (each touch extends it), not a clock started at upload, and sessions live in one process's memory."],
  ["The validator proves each quote sits in the cited paragraph, not that the restatement follows from it; reading the excerpt is the reader's check.", "Budgets, the analysis gate and the model-call cap live in one process's memory, like the sessions; no cross-origin access is granted unless CORS_ORIGINS names an origin."],
];
let ny = NY + 26;
for (const note of notes) {
  add(`<circle cx="66" cy="${ny - 4}" r="2.5" fill="${PRIMARY}"/>`);
  const spans = note.map((line, i) => `<tspan x="78" dy="${i === 0 ? 0 : 15}">${esc(line)}</tspan>`).join("");
  add(`<text x="78" y="${ny}" class="b" font-size="12" fill="${INK}">${spans}</text>`);
  ny += 15 * note.length + 9;
}

// Legend
const LX = 1085;
add(`<text x="${LX}" y="${NY}" class="t" font-size="17" font-weight="700" fill="${INK}">Legend</text>`);
const legend = [
  [TIME, "browser (React 19 + Vite)"],
  [PRIMARY, "API (Express 5, one Node process)"],
  [MONEY, "worker thread, one per document"],
  [DUTY, "Anthropic, or the mock in tests"],
];
let ly = NY + 26;
for (const [color, text] of legend) {
  add(`<rect x="${LX}" y="${ly - 11}" width="14" height="14" rx="3" fill="${CARD}" stroke="${color}" stroke-width="1.5"/>`);
  add(`<text x="${LX + 22}" y="${ly}" class="b" font-size="12" fill="${INK}">${esc(text)}</text>`);
  ly += 22;
}
add(`<path d="M${LX} ${ly - 4} L${LX + 40} ${ly - 4}" stroke="${MUTED}" stroke-width="1.6" marker-end="url(#head)"/>`);
add(`<text x="${LX + 50}" y="${ly}" class="b" font-size="12" fill="${INK}">request or data</text>`);
ly += 22;
add(`<path d="M${LX} ${ly - 4} L${LX + 40} ${ly - 4}" stroke="${MUTED}" stroke-width="1.6" stroke-dasharray="6 5" marker-end="url(#head)"/>`);
add(`<text x="${LX + 50}" y="${ly}" class="b" font-size="12" fill="${INK}">deletion, explicit or at TTL</text>`);
ly += 30;
add(`<text x="${LX}" y="${ly}" class="b" font-size="11" fill="${MUTED}">Source: scripts/docs/architecture-diagram.mjs</text>`);

add(`<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="${BORDER}"/>`);
add(`</svg>`);

writeFileSync(OUT, parts.join("\n") + "\n");
console.log(`wrote ${OUT} (${Buffer.byteLength(parts.join("\n"))} bytes)`);
