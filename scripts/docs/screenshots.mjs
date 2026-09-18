#!/usr/bin/env node
/**
 * Regenerates the README's screenshots (docs/screenshots/*.webp) and the
 * journey animation (docs/screenshots/journey.gif) from the running app, so
 * the pictures in the README are what the product shows and can be re-taken
 * after a screen changes.
 *
 * Drives the same journeys as the accessibility audit, with the mouse: the
 * offer letter sample through map, review, two questions about it and the
 * packet; the two rental agreement versions through compare; the help
 * screen; the safety screen (one of the sample answers with a safety cue);
 * the dark theme; and the document map at phone width. Everything shown is
 * synthetic: the sample documents in samples/, the offline sign-in
 * stand-in's reader.
 *
 *   BASE_URL=http://localhost:5173 node scripts/docs/screenshots.mjs
 *
 * Needs the web client with VITE_AUTH_PROVIDER=mock and the API with
 * AUTH_PROVIDER=mock (the model itself may be real or LLM_PROVIDER=mock),
 * the system Chromium (CHROMIUM_PATH), ImageMagick (`magick`) for WebP and
 * ffmpeg for the GIF.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
const CHROMIUM_PATH = process.env.CHROMIUM_PATH ?? (existsSync("/repl/tools/bin/chromium") ? "/repl/tools/bin/chromium" : undefined);
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "screenshots");
const READY_TIMEOUT = 120_000;
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
/** The frames of journey.gif, in order, and how long each is held (seconds). */
const GIF_FRAMES = [
  ["welcome", 2.0],
  ["welcome-choices", 1.8],
  ["upload", 1.8],
  ["interview", 1.8],
  ["map", 2.6],
  ["map-source-open", 2.6],
  ["review", 2.6],
  ["packet", 2.8],
];
/** Sticky header height at desktop width, kept clear when a frame scrolls to an element. */
const HEADER_PX = 88;
const SITUATION = "I have not signed yet. I want to understand the notice period and the training bond before I do.";
/** The Ask screen's two pictures: a question the offer letter answers, then one it does not. */
const ASK_QUESTIONS = ["What is the notice period during probation?", "Does the letter say anything about parental leave?"];

for (const [tool, args] of [
  ["magick", ["-version"]],
  ["ffmpeg", ["-version"]],
]) {
  if (spawnSync(tool, args, { stdio: "ignore" }).status !== 0) {
    console.error(`${tool} is needed and was not found on PATH.`);
    process.exit(2);
  }
}
if (!CHROMIUM_PATH) {
  console.error("No Chromium found: set CHROMIUM_PATH to a Chromium/Chrome executable.");
  process.exit(2);
}

const work = mkdtempSync(join(tmpdir(), "clausecompass-shots-"));
mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ["--no-sandbox", "--disable-gpu"] });
const taken = [];

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const finite = document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity);
    await Promise.race([Promise.allSettled(finite.map((a) => a.finished)), new Promise((r) => setTimeout(r, 2000))]);
  });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(250);
}

/**
 * One picture. Without `focus`, the WebP for the README is the top of the
 * page down to `height` CSS pixels (one viewport by default) and the GIF
 * frame is the first viewport. With `focus` (a CSS selector), the page is
 * scrolled so that element sits under the header: the GIF frame is that
 * viewport, and so is the WebP unless a `height` asks for the top of the
 * page instead.
 */
async function shoot(page, name, { height, focus } = {}) {
  await settle(page);
  const { width, height: viewportHeight } = page.viewportSize();
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const source = join(work, `${name}-source.png`);
  const frame = join(work, `${name}.png`);
  const wantsFrame = GIF_FRAMES.some(([frameName]) => frameName === name);
  if (focus) {
    await page.evaluate(({ selector, header }) => {
      document.querySelector(selector)?.scrollIntoView({ block: "start" });
      window.scrollBy(0, -header);
    }, { selector: focus, header: HEADER_PX });
    await page.waitForTimeout(300);
    await page.screenshot({ path: wantsFrame ? frame : source });
    if (wantsFrame && height) {
      // Back at the top before the tall capture, or the sticky header is drawn twice: once where it sits, once where it stuck.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(250);
      await page.screenshot({ path: source, fullPage: true, clip: { x: 0, y: 0, width, height: Math.min(height, pageHeight) } });
    } else if (wantsFrame) {
      spawnSync("cp", [frame, source]);
    }
  } else {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    await page.screenshot({ path: source, fullPage: true, clip: { x: 0, y: 0, width, height: Math.min(height ?? viewportHeight, pageHeight) } });
    if (wantsFrame) await page.screenshot({ path: frame });
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  const converted = spawnSync("magick", [source, "-quality", "82", "-define", "webp:method=6", join(OUT_DIR, `${name}.webp`)], { stdio: "inherit" });
  if (converted.status !== 0) throw new Error(`WebP conversion failed for ${name}`);
  taken.push(name);
  console.log(`  ${name}`);
}

async function arrive(page, path) {
  await page.waitForURL((url) => new URL(url).pathname === path, { timeout: 15_000 });
  await page.getByTestId("status-screen-loading").waitFor({ state: "detached", timeout: 15_000 });
  await page.waitForTimeout(400);
}

/** A signed-out reader is sent to /sign-in first; one who signed in earlier in the same browser goes straight to /upload. */
async function signInThrough(page) {
  await page.waitForURL((url) => ["/sign-in", "/upload"].includes(new URL(url).pathname), { timeout: 15_000 });
  if (new URL(page.url()).pathname === "/sign-in") await page.getByTestId("button-sign-in-google").click();
  await arrive(page, "/upload");
}

async function loadSample(page, sampleId, slot) {
  await page.getByTestId(`button-sample-${sampleId}`).click();
  await page.getByTestId(`card-file-${slot}`).waitFor();
}

async function consentAndContinue(page) {
  // The visible box is a decoration over the real (screen-reader-only) input, so tick it the way a keyboard user does.
  await page.getByTestId("checkbox-consent").focus();
  await page.keyboard.press("Space");
  await page.getByTestId("button-continue").click();
  await arrive(page, "/interview");
}

async function singleDocument(page, { pictures }) {
  await page.goto(`${BASE_URL}/`);
  await page.getByTestId("button-stage-before-signing").waitFor();
  if (pictures) {
    await shoot(page, "welcome");
    await shoot(page, "welcome-choices", { focus: "#stage-heading" });
  }
  await page.getByTestId("button-stage-before-signing").click();
  await arrive(page, "/sign-in");
  if (pictures) await shoot(page, "sign-in");
  await signInThrough(page);
  await loadSample(page, "offer-letter", "primary");
  if (pictures) await shoot(page, "upload", { height: 1300 });
  await consentAndContinue(page);
  await page.getByTestId("input-situation").fill(SITUATION);
  if (pictures) await shoot(page, "interview", { height: 1100 });
  await page.getByTestId("button-continue-to-map").click();
  await arrive(page, "/map");
  await page.getByTestId("link-continue-to-review").waitFor({ timeout: READY_TIMEOUT });
  await shoot(page, pictures ? "map" : "map-phone", { height: pictures ? 1600 : undefined, focus: '[data-testid^="section-map-"]' });
  if (!pictures) return;
  await page.getByTestId("button-toggle-source").first().click();
  await shoot(page, "map-source-open", { height: 1600, focus: '[data-testid^="section-map-"]' });
  await page.getByTestId("link-continue-to-review").click();
  await arrive(page, "/review");
  await page.getByTestId("link-continue-to-packet").waitFor({ timeout: READY_TIMEOUT });
  const places = page.getByTestId("button-toggle-places");
  if (await places.count()) await places.first().click();
  await shoot(page, "review", { height: 1600, focus: '[data-testid="section-review-primary"]' });
  // The way aside: two questions about the document, one it answers and one it does not, then back through the map.
  await page.getByTestId("link-ask-document").click();
  await arrive(page, "/ask");
  for (const question of ASK_QUESTIONS) {
    await page.getByTestId("input-question").fill(question);
    await page.getByTestId("button-ask").click();
    await page.locator('[data-testid="text-asking"]').waitFor({ state: "detached", timeout: READY_TIMEOUT });
  }
  await shoot(page, "ask", { focus: '[data-testid="section-ask-thread"]' });
  await shoot(page, "ask-not-answered", { focus: '[data-testid="text-ask-exchange"]:last-of-type' });
  await page.getByTestId("link-back-to-map").click();
  await arrive(page, "/map");
  await page.getByTestId("link-continue-to-review").click();
  await arrive(page, "/review");
  await page.getByTestId("link-continue-to-packet").waitFor({ timeout: READY_TIMEOUT });
  await page.getByTestId("link-continue-to-packet").click();
  await arrive(page, "/packet");
  await page.getByTestId("button-print-packet").waitFor({ timeout: READY_TIMEOUT });
  await shoot(page, "packet", { height: 1600, focus: '[data-testid="packet-document"]' });
  await page.getByTestId("button-delete-session").click();
  await arrive(page, "/");
}

async function compareVersions(page) {
  await page.goto(`${BASE_URL}/`);
  await page.getByTestId("button-stage-compare-versions").click();
  await signInThrough(page);
  await loadSample(page, "rental-agreement", "older");
  await loadSample(page, "rental-agreement-v2", "newer");
  await shoot(page, "upload-compare", { height: 1100 });
  await consentAndContinue(page);
  await page.getByTestId("button-continue-to-compare").click();
  await arrive(page, "/compare");
  await page.getByTestId("link-continue-to-packet").waitFor({ timeout: READY_TIMEOUT });
  await shoot(page, "compare", { height: 1500 });
  await page.getByTestId("link-continue-to-packet").click();
  await arrive(page, "/packet");
  await page.getByTestId("button-print-packet").waitFor({ timeout: READY_TIMEOUT });
  await page.getByTestId("button-delete-session").click();
  await arrive(page, "/");
}

async function helpSafetyDark(page) {
  await page.goto(`${BASE_URL}/help`);
  await page.getByTestId("link-back-from-help").waitFor();
  await shoot(page, "help", { height: 1300 });

  await page.goto(`${BASE_URL}/`);
  await page.getByTestId("button-stage-problem-started").click();
  await signInThrough(page);
  await loadSample(page, "rental-agreement", "primary");
  await consentAndContinue(page);
  await page.getByTestId("button-sample-answer-threat-of-violence").click();
  await page.getByTestId("status-sample-answer").waitFor();
  await page.getByTestId("button-continue-to-map").click();
  await arrive(page, "/safety");
  await shoot(page, "safety", { height: 1000 });
  await page.getByTestId("button-start-over").click();
  await arrive(page, "/");

  await page.getByTestId("button-settings").click();
  await page.getByTestId("button-theme-dark").click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  await shoot(page, "welcome-dark");
}

function buildGif() {
  const list = join(work, "frames.txt");
  const lines = GIF_FRAMES.map(([name, hold]) => `file '${join(work, `${name}.png`)}'\nduration ${hold}`);
  // The concat demuxer ignores the last duration unless the last file is repeated.
  lines.push(`file '${join(work, `${GIF_FRAMES.at(-1)[0]}.png`)}'`);
  spawnSync("sh", ["-c", `cat > "${list}"`], { input: lines.join("\n") + "\n" });
  const filter = "scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle";
  const out = join(OUT_DIR, "journey.gif");
  const made = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-vf", filter, "-loop", "0", out], { stdio: "inherit" });
  if (made.status !== 0) throw new Error("ffmpeg could not build journey.gif");
  console.log("  journey.gif");
}

try {
  console.log(`Taking screenshots of ${BASE_URL} into ${OUT_DIR}`);
  const desktop = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1, colorScheme: "light" });
  const page = await desktop.newPage();
  await singleDocument(page, { pictures: true });
  await compareVersions(page);
  await helpSafetyDark(page);
  await desktop.close();

  const phone = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: "light" });
  await singleDocument(await phone.newPage(), { pictures: false });
  await phone.close();

  buildGif();
  console.log(`${taken.length} screenshots and the journey animation written.`);
} finally {
  await browser.close();
  rmSync(work, { recursive: true, force: true });
}
