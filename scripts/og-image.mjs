// Renders the social preview card (artifacts/clausecompass/public/og-image.jpg,
// 1200×630) with the system Chromium: the brand mark and name, the tagline,
// the boundary line, and the banner photograph, in the product's own faces
// and colours. Run again after the wordmark, the tagline or the photograph
// changes: `node scripts/og-image.mjs`.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = path.join(root, "artifacts/clausecompass");
const out = path.join(app, "public/og-image.jpg");

const font = (pkg, file) => `file://${path.join(root, "node_modules/@fontsource-variable", pkg, "files", file)}`;
const photo = `data:image/jpeg;base64,${readFileSync(path.join(app, "src/assets/hero-art.jpg")).toString("base64")}`;

// Light-theme tokens from src/index.css, written as hex.
const paper = "#f9f6f1";
const ink = "#212a3b";
const terracotta = "#a84524";
const muted = "#566376";
const line = "#e6dfd2";

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Lora; src: url(${font("lora", "lora-latin-wght-normal.woff2")}) format("woff2-variations"); font-weight: 100 1000; }
@font-face { font-family: "DM Sans"; src: url(${font("dm-sans", "dm-sans-latin-wght-normal.woff2")}) format("woff2-variations"); font-weight: 100 1000; }
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
body { position: relative; background: ${paper}; color: ${ink}; font-family: "DM Sans", sans-serif; }
.photo { position: absolute; top: 0; right: 0; width: 560px; height: 630px; object-fit: cover; object-position: 60% 100%;
  -webkit-mask-image: linear-gradient(to right, transparent 0%, black 30%), linear-gradient(to bottom, transparent 0%, black 10%, black 92%, transparent 100%);
  -webkit-mask-composite: source-in; }
.words { position: absolute; left: 72px; top: 0; bottom: 0; width: 620px; display: flex; flex-direction: column; justify-content: center; gap: 28px; }
.brand { display: flex; align-items: center; gap: 22px; }
.name { font-family: Lora, serif; font-weight: 700; font-size: 84px; letter-spacing: -0.02em; line-height: 1; }
.name b { font-weight: 700; color: ${terracotta}; }
.tagline { font-family: Lora, serif; font-weight: 500; font-size: 38px; line-height: 1.2; max-width: 560px; }
.rule { width: 56px; height: 3px; background: ${terracotta}; border-radius: 2px; }
.boundary { font-size: 26px; font-weight: 600; letter-spacing: 0.02em; color: ${muted}; }
.edge { position: absolute; left: 0; top: 0; bottom: 0; width: 14px; background: ${terracotta}; }
.hairline { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: ${line}; }
</style></head><body>
<img class="photo" src="${photo}" alt="">
<div class="edge"></div>
<div class="words">
  <div class="brand">
    <svg viewBox="0 0 48 48" width="92" height="92" aria-hidden="true">
      <circle cx="24" cy="24" r="21" fill="#fff" stroke="${terracotta}" stroke-width="2.5"/>
      <circle cx="24" cy="24" r="16.5" fill="none" stroke="${terracotta}" stroke-opacity=".5" stroke-width="1" stroke-dasharray="1.2 3.05"/>
      <rect x="23.25" y="5.5" width="1.5" height="4" rx=".75" fill="${terracotta}"/>
      <rect x="23.25" y="5.5" width="1.5" height="4" rx=".75" fill="${terracotta}" transform="rotate(90 24 24)"/>
      <rect x="23.25" y="5.5" width="1.5" height="4" rx=".75" fill="${terracotta}" transform="rotate(180 24 24)"/>
      <rect x="23.25" y="5.5" width="1.5" height="4" rx=".75" fill="${terracotta}" transform="rotate(270 24 24)"/>
      <g transform="rotate(35 24 24)">
        <path d="M24 9.5 27.8 24H20.2Z" fill="${terracotta}"/>
        <path d="M24 38.5 27.8 24H20.2Z" fill="${ink}" fill-opacity=".35"/>
      </g>
      <circle cx="24" cy="24" r="2.4" fill="#fff" stroke="${terracotta}" stroke-width="1.5"/>
    </svg>
    <div class="name">Clause<b>Compass</b></div>
  </div>
  <div class="tagline">Plain-language navigation for legal documents.</div>
  <div class="rule"></div>
  <div class="boundary">Information, not legal advice</div>
</div>
<div class="hairline"></div>
</body></html>`;

const browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const jpeg = await page.screenshot({ type: "jpeg", quality: 86 });
  writeFileSync(out, jpeg);
  console.log(`wrote ${path.relative(root, out)} (${jpeg.length} bytes)`);
} finally {
  await browser.close();
}
