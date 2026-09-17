/**
 * The journeys the audit drives, keyboard only. Every navigation and
 * activation goes through the keyboard; the file picker is the one exception
 * (setInputFiles stands in for the operating system's dialog, which a
 * keyboard user opens with Enter on the same input).
 */

import { restartFromTop } from "./keyboard.mjs";

const READY_TIMEOUT = 90_000;

class DeadEnd extends Error {
  constructor(message, path) {
    super(`${message}\n  Tab path: ${path.map((stop) => stop.testid ?? `${stop.tag}:${stop.name}`).join(" → ") || "(nothing)"}`);
    this.name = "DeadEnd";
  }
}

function matches(stop, target) {
  if (typeof target === "string") return stop.testid === target;
  if (target.name) return target.name.test(stop.name);
  if (target.role) return stop.role === target.role || (target.role === "radio" && stop.type === "radio");
  return false;
}

/** Presses Tab until the wanted control has focus; a full cycle without it is a dead end. */
export async function tabTo(page, auditor, target, { shift = false, max = 200 } = {}) {
  const path = [];
  const keys = new Set();
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(shift ? "Shift+Tab" : "Tab");
    const stop = await auditor.focused();
    if (matches(stop, target)) return stop;
    if (stop.tag !== "body") {
      if (keys.has(stop.key)) throw new DeadEnd(`${describe(target)} is not reachable with Tab on ${new URL(page.url()).pathname} (focus came back round)`, path);
      keys.add(stop.key);
      path.push(stop);
    }
  }
  throw new DeadEnd(`${describe(target)} not reached within ${max} Tab presses on ${new URL(page.url()).pathname}`, path);
}

function describe(target) {
  return typeof target === "string" ? `[data-testid=${target}]` : JSON.stringify(target);
}

async function expectPath(page, path) {
  await page.waitForURL((url) => new URL(url).pathname === path, { timeout: 15_000 }).catch(() => {
    throw new DeadEnd(`expected to arrive at ${path}, still on ${new URL(page.url()).pathname}`, []);
  });
  // A screen reached before its code has arrived shows one loading line first; the screen is what gets audited.
  await page.waitForSelector('[data-testid="status-screen-loading"]', { state: "detached", timeout: 15_000 });
}

function visible(page, testid, timeout = 15_000) {
  return page.waitForSelector(`[data-testid="${testid}"]`, { state: "visible", timeout });
}

function present(page, testid) {
  return page.$(`[data-testid="${testid}"]`);
}

/** Where focus landed after a navigation: recorded, since a keyboard user starts from there. */
async function focusAfterNavigation(page, auditor, screen) {
  await page.waitForTimeout(150);
  const stop = await auditor.focused();
  auditor.journeyNotes ??= [];
  auditor.journeyNotes.push({ screen, focusedAfterNavigation: stop.tag === "body" ? "body (document start)" : `${stop.tag} ${stop.testid ?? stop.name}` });
  return stop;
}

async function pressAndExpect(page, auditor, testid, key, path) {
  await tabTo(page, auditor, testid);
  await page.keyboard.press(key);
  await expectPath(page, path);
}

/** Tab → skip link → Enter must move the next Tab stop inside <main>. */
async function checkSkipLink(page, auditor, screen) {
  await restartFromTop(page);
  await page.keyboard.press("Tab");
  const first = await auditor.focused();
  if (first.testid !== "link-skip-to-content") {
    auditor.problem("skip-link-not-first", { screen, stop: first });
    return;
  }
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  const inMain = await page.evaluate(() => Boolean(document.activeElement?.closest("main")));
  if (!inMain) auditor.problem("skip-link-ineffective", { screen, stop: await auditor.focused() });
}

async function loadSample(page, auditor, sampleId, slot) {
  await tabTo(page, auditor, `button-sample-${sampleId}`);
  await page.keyboard.press("Enter");
  await visible(page, `card-file-${slot}`);
}

async function consentAndContinue(page, auditor) {
  await tabTo(page, auditor, "checkbox-consent");
  await page.keyboard.press("Space");
  const checked = await page.evaluate(() => document.activeElement.checked);
  if (!checked) throw new DeadEnd("Space did not tick the consent checkbox", []);
  await pressAndExpect(page, auditor, "button-continue", "Enter", "/interview");
}

/**
 * The sign-in gate in front of the upload screen. A fresh browser context is
 * signed out, so the first stage button of a journey lands on /sign-in; the
 * web client under audit runs its offline stand-in (VITE_AUTH_PROVIDER=mock),
 * whose "Continue with Google" signs in at once and hands the reader on to
 * the screen they were heading for. The screen itself is audited once, in
 * the single-document journey, with the e-mail form's error state included.
 */
async function signInThrough(page, auditor, { audit }) {
  await expectPath(page, "/sign-in");
  await focusAfterNavigation(page, auditor, "sign-in");
  if (audit) {
    await checkSkipLink(page, auditor, "sign-in");
    await auditor.screen("sign-in");
    // Submitting the empty form must take focus to the error, and the error must name the missing field.
    await tabTo(page, auditor, "button-sign-in-submit");
    await page.keyboard.press("Enter");
    await visible(page, "text-error-sign-in");
    const afterEmptySubmit = await auditor.focused();
    if (afterEmptySubmit.testid !== "text-error-sign-in") auditor.problem("no-focus-on-sign-in-error", { screen: "sign-in", stop: afterEmptySubmit });
    await auditor.screen("sign-in-error", { cycle: false });
    // The mode switch is a button, so the create-account form is one keypress away.
    await tabTo(page, auditor, "button-mode-create");
    await page.keyboard.press("Enter");
    await visible(page, "button-mode-sign-in");
    await auditor.screen("sign-in-create-account");
  }
  await pressAndExpect(page, auditor, "button-sign-in-google", "Enter", "/upload");
}

async function singleDocument(page, auditor) {
  await page.goto("/");
  await visible(page, "button-stage-before-signing");
  await checkSkipLink(page, auditor, "welcome");
  await auditor.screen("welcome");

  await pressAndExpect(page, auditor, "button-stage-before-signing", "Enter", "/sign-in");
  await signInThrough(page, auditor, { audit: true });
  await focusAfterNavigation(page, auditor, "upload");
  await checkSkipLink(page, auditor, "upload");
  await auditor.screen("upload-empty");

  // Continue with nothing chosen: the screen must take focus to what is missing, not sit silent.
  await tabTo(page, auditor, "button-continue");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  const afterEmptySubmit = await auditor.focused();
  if (afterEmptySubmit.testid !== "input-file-primary") auditor.problem("no-focus-on-missing-file", { screen: "upload-empty", stop: afterEmptySubmit });
  await auditor.screen("upload-missing-file", { cycle: false });

  // The picker's result for a file the client refuses: the error must be announced and the way out reachable.
  await tabTo(page, auditor, "input-file-primary");
  await page.setInputFiles('[data-testid="input-file-primary"]', { name: "scan.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ\u0000\u0000not a document") });
  await visible(page, "text-error-primary");
  await auditor.screen("upload-invalid-file");

  await loadSample(page, auditor, "offer-letter", "primary");
  await auditor.screen("upload-ready");

  // Continue without consent: focus must go to the checkbox with its error.
  await tabTo(page, auditor, "button-continue");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  const afterNoConsent = await auditor.focused();
  if (afterNoConsent.testid !== "checkbox-consent") auditor.problem("no-focus-on-missing-consent", { screen: "upload-ready", stop: afterNoConsent });
  await visible(page, "text-error-consent");
  await auditor.screen("upload-consent-error", { cycle: false });
  await page.keyboard.press("Space");
  await pressAndExpect(page, auditor, "button-continue", "Enter", "/interview");
  await focusAfterNavigation(page, auditor, "interview");
  await auditor.screen("interview");

  await tabTo(page, auditor, "input-situation");
  await page.keyboard.type("I have not signed yet. I want to understand the notice period and the training bond before I do.");
  await pressAndExpect(page, auditor, "button-continue-to-map", "Enter", "/map");
  await focusAfterNavigation(page, auditor, "map");
  if (await present(page, "text-analysing")) await auditor.screen("map-analysing", { cycle: false });
  await visible(page, "link-continue-to-review", READY_TIMEOUT);
  await auditor.screen("map-ready");

  const toggle = await tabTo(page, auditor, "button-toggle-source");
  await page.keyboard.press("Enter");
  const expanded = await auditor.focused();
  if (expanded.expanded !== "true") auditor.problem("disclosure-not-toggled", { screen: "map-ready", stop: toggle });
  await auditor.screen("map-source-open");

  await pressAndExpect(page, auditor, "link-continue-to-review", "Enter", "/review");
  await focusAfterNavigation(page, auditor, "review");
  await visible(page, "link-continue-to-packet", READY_TIMEOUT);
  await auditor.screen("review-ready");
  if (await present(page, "button-toggle-places")) {
    await tabTo(page, auditor, "button-toggle-places");
    await page.keyboard.press("Enter");
  }
  if (await present(page, "button-toggle-paragraph-0")) {
    await tabTo(page, auditor, "button-toggle-paragraph-0");
    await page.keyboard.press("Enter");
  }
  await auditor.screen("review-expanded");

  await pressAndExpect(page, auditor, "link-continue-to-packet", "Enter", "/packet");
  await focusAfterNavigation(page, auditor, "packet");
  await visible(page, "button-print-packet", READY_TIMEOUT);
  await auditor.screen("packet-ready");

  // A reference link must take focus to its excerpt, and the bypass link must land past the packet.
  await tabTo(page, auditor, { name: /^Reference \[\d+\]$/ });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  const onCitation = await auditor.focused();
  if (!/^packet-citation-/.test(onCitation.testid ?? "")) auditor.problem("reference-link-no-focus", { screen: "packet-ready", stop: onCitation });
  await restartFromTop(page);
  await tabTo(page, auditor, "link-skip-packet");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  const pastPacket = await auditor.focused();
  if (pastPacket.testid !== "link-packet-official-help") auditor.problem("packet-bypass-ineffective", { screen: "packet-ready", stop: pastPacket });

  await tabTo(page, auditor, "button-print-packet");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  if ((await page.evaluate(() => window.__printed)) !== 1) auditor.problem("print-not-triggered", { screen: "packet-ready" });

  await tabTo(page, auditor, "button-download-packet-text");
  const download = page.waitForEvent("download", { timeout: 10_000 });
  await page.keyboard.press("Enter");
  await download.catch(() => auditor.problem("download-not-triggered", { screen: "packet-ready" }));

  await pressAndExpect(page, auditor, "button-delete-session", "Enter", "/");
  const afterDelete = await focusAfterNavigation(page, auditor, "welcome-after-delete");
  if (afterDelete.role !== "status") auditor.problem("delete-confirmation-not-focused", { screen: "welcome-after-delete", stop: afterDelete });
  await auditor.screen("welcome-after-delete");
}

async function compareVersions(page, auditor) {
  await page.goto("/");
  await visible(page, "button-stage-compare-versions");
  await pressAndExpect(page, auditor, "button-stage-compare-versions", "Enter", "/sign-in");
  await signInThrough(page, auditor, { audit: false });
  await auditor.screen("upload-compare-empty");
  await loadSample(page, auditor, "rental-agreement", "older");
  await loadSample(page, auditor, "rental-agreement-v2", "newer");
  await auditor.screen("upload-compare-ready");

  // The remove control of a chosen file must be reachable and must hand focus somewhere sensible.
  await tabTo(page, auditor, "button-remove-newer");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  const afterRemove = await auditor.focused();
  if (afterRemove.tag === "body") auditor.problem("focus-lost-after-remove", { screen: "upload-compare-ready", stop: afterRemove });
  await loadSample(page, auditor, "rental-agreement-v2", "newer");

  await consentAndContinue(page, auditor);
  await auditor.screen("interview-compare");
  await pressAndExpect(page, auditor, "button-continue-to-compare", "Enter", "/compare");
  await focusAfterNavigation(page, auditor, "compare");
  await visible(page, "link-continue-to-packet", READY_TIMEOUT);
  await auditor.screen("compare-ready");
  await pressAndExpect(page, auditor, "link-continue-to-packet", "Enter", "/packet");
  await visible(page, "button-print-packet", READY_TIMEOUT);
  await auditor.screen("packet-compare");
  await restartFromTop(page);
  await tabTo(page, auditor, "link-skip-packet");
  await page.keyboard.press("Enter");
  await pressAndExpect(page, auditor, "button-delete-session", "Enter", "/");
}

async function helpSafetyNotFound(page, auditor) {
  await page.goto("/");
  await visible(page, "button-stage-problem-started");

  // The settings menu in the header: Enter on the gear opens it, the panel's controls follow it in the Tab order, a theme takes effect at once, and Escape closes it with focus back on the gear.
  await tabTo(page, auditor, "button-settings");
  await page.keyboard.press("Enter");
  await visible(page, "settings-panel");
  await auditor.screen("welcome-settings-open", { cycle: false });
  const darkButton = await tabTo(page, auditor, "button-theme-dark");
  await page.keyboard.press("Enter");
  if (!(await page.evaluate(() => document.documentElement.classList.contains("dark")))) auditor.problem("theme-not-applied", { screen: "welcome-settings-open", stop: darkButton });
  await auditor.screen("welcome-settings-dark", { cycle: false });
  await tabTo(page, auditor, "button-theme-system");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  const afterEscape = await auditor.focused();
  if (afterEscape.testid !== "button-settings") auditor.problem("settings-escape-focus-lost", { screen: "welcome-settings-open", stop: afterEscape });
  if (await page.$('[data-testid="settings-panel"]:not([hidden])')) auditor.problem("settings-panel-still-open", { screen: "welcome-settings-open", stop: afterEscape });

  await pressAndExpect(page, auditor, "link-welcome-official-help", "Enter", "/help");
  await focusAfterNavigation(page, auditor, "help");
  await auditor.screen("help");

  // The concern filter is a radio group: arrow keys must move the choice and the list must follow.
  const radio = await tabTo(page, auditor, { role: "radio" });
  await page.keyboard.press("ArrowDown");
  const next = await auditor.focused();
  if (next.type !== "radio" || next.name === radio.name) auditor.problem("radio-arrows-inert", { screen: "help", stop: next });
  await page.waitForTimeout(200);
  await auditor.screen("help-filtered", { cycle: false });
  await pressAndExpect(page, auditor, "link-back-from-help", "Enter", "/");

  await pressAndExpect(page, auditor, "button-stage-problem-started", "Enter", "/sign-in");
  await signInThrough(page, auditor, { audit: false });
  await loadSample(page, auditor, "rental-agreement", "primary");
  await consentAndContinue(page, auditor);
  await tabTo(page, auditor, "button-sample-answer-threat-of-violence");
  await page.keyboard.press("Enter");
  await visible(page, "status-sample-answer");
  await pressAndExpect(page, auditor, "button-continue-to-map", "Enter", "/safety");
  const onSafety = await focusAfterNavigation(page, auditor, "safety");
  if (onSafety.tag !== "h1") auditor.problem("safety-heading-not-focused", { screen: "safety", stop: onSafety });
  await auditor.screen("safety");
  await pressAndExpect(page, auditor, "button-start-over", "Enter", "/");

  await page.goto("/there-is-no-such-page");
  await visible(page, "link-return-home");
  await auditor.screen("not-found");
  await pressAndExpect(page, auditor, "link-return-home", "Enter", "/");
}

const JOURNEYS = { "single-document": singleDocument, "compare-versions": compareVersions, "help-safety-not-found": helpSafetyNotFound };

export async function runJourney(name, page, auditor) {
  await JOURNEYS[name](page, auditor);
  if (auditor.journeyNotes) {
    for (const note of auditor.journeyNotes) console.log(`    focus after navigation → ${note.screen}: ${note.focusedAfterNavigation}`);
  }
}
