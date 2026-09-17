#!/usr/bin/env node
/**
 * Keyboard-only journey + axe audit of the ClauseCompass web client.
 *
 * Drives the whole journey (welcome → upload → interview → map → review →
 * compare → packet → delete, plus /help, /safety and not-found) with the
 * keyboard alone — the mouse is disabled at the driver level — and, on every
 * screen and state reached, records the Tab order with each stop's
 * accessible name and focus indicator, then runs axe-core (WCAG 2.x A/AA +
 * best-practice) in light and dark mode. Exit code 1 when any critical or
 * serious axe violation remains, when a control is reached that has no
 * accessible name or no visible focus indicator, or when a step of the
 * journey cannot be completed from the keyboard.
 *
 *   pnpm a11y                          (web client + API with LLM_PROVIDER=mock must be running)
 *   BASE_URL=http://localhost:5173 CHROMIUM_PATH=/usr/bin/chromium pnpm a11y
 *   A11Y_JOURNEYS=single-document pnpm a11y      (one journey; unknown or empty names are refused)
 *
 * The report is written to scripts/a11y/report/ (ignored by git).
 */
import axe from "axe-core";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { restartFromTop } from "./keyboard.mjs";
import { runJourney } from "./steps.mjs";

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:80").replace(/\/$/, "");
const CHROMIUM_PATH = process.env.CHROMIUM_PATH ?? (existsSync("/repl/tools/bin/chromium") ? "/repl/tools/bin/chromium" : undefined);
const REPORT_DIR = join(dirname(fileURLToPath(import.meta.url)), "report");
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
/** Development-only chrome injected by the Replit Vite plugins, not part of the product. */
const AXE_EXCLUDE = [["#replit-dev-banner"], ["replit-dev-banner"], ["vite-error-overlay"]];
const GATING_IMPACTS = new Set(["critical", "serious"]);

if (!CHROMIUM_PATH) {
  console.error("No Chromium found: set CHROMIUM_PATH to a Chromium/Chrome executable.");
  process.exit(2);
}

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ["--no-sandbox", "--disable-gpu"] });
const report = { baseUrl: BASE_URL, startedAt: new Date().toISOString(), screens: [], problems: [], journeys: [] };

/** Everything a screen visit records: the Tab cycle and the axe results in both colour schemes. */
class Auditor {
  constructor(page, journey) {
    this.page = page;
    this.journey = journey;
    this.seen = new Set();
  }

  problem(kind, detail) {
    report.problems.push({ journey: this.journey, kind, ...detail });
  }

  /** A descriptor of document.activeElement, with the focus indicator measured while focused. */
  async focused() {
    return this.page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return { tag: "body", name: "", testid: null, focusVisible: false, indicator: null, onScreen: true };
      // A stable identity for the element across the cycle, since data-testids repeat (one per source card, one per reference).
      if (!el.__a11yKey) el.__a11yKey = `k${(window.__a11yCount = (window.__a11yCount ?? 0) + 1)}`;
      const rect = el.getBoundingClientRect();
      const labelledBy = el.getAttribute("aria-labelledby");
      const name =
        el.getAttribute("aria-label") ??
        (labelledBy
          ? labelledBy
              .split(/\s+/)
              .map((id) => document.getElementById(id)?.textContent ?? "")
              .join(" ")
          : null) ??
        (el.labels && el.labels.length ? Array.from(el.labels).map((l) => l.textContent).join(" ") : null) ??
        el.getAttribute("alt") ??
        el.getAttribute("title") ??
        el.textContent ??
        "";
      return {
        key: el.__a11yKey,
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute("role"),
        type: el.getAttribute("type"),
        name: name.replace(/\s+/g, " ").trim().slice(0, 80),
        testid: el.getAttribute("data-testid"),
        id: el.id || null,
        href: el.getAttribute("href"),
        expanded: el.getAttribute("aria-expanded"),
        focusVisible: el.matches(":focus-visible"),
        indicator: window.__a11yIndicator(el),
        onScreen: rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth,
        rect: { top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) },
      };
    });
  }

  /** The same measurements on the element that was just focused, after focus has moved away (the unfocused baseline). */
  async baselineOf(previous) {
    return this.page.evaluate((prev) => {
      const el = Array.from(document.querySelectorAll("*")).find((node) => node.__a11yKey === prev.key);
      if (!el || el === document.activeElement) return null;
      return window.__a11yIndicator(el);
    }, previous);
  }

  /**
   * Presses Tab from the top of the document until focus comes back round,
   * recording every stop. Flags a stop with no accessible name, one whose
   * focused styles do not differ from its unfocused styles (no visible
   * indicator), and one that stays off screen when focused.
   */
  async tabCycle(label) {
    await restartFromTop(this.page);
    const stops = [];
    const keys = new Set();
    let previous = null;
    let closed = false;
    for (let i = 0; i < 400; i++) {
      await this.page.keyboard.press("Tab");
      const stop = await this.focused();
      if (stop.tag === "body") {
        if (stops.length === 0) continue;
        closed = true;
        break;
      }
      if (keys.has(stop.key)) {
        closed = true;
        break;
      }
      keys.add(stop.key);
      if (previous) {
        const baseline = await this.baselineOf(previous);
        previous.indicatorVisible = baseline ? baseline !== previous.indicator : null;
      }
      stops.push(stop);
      previous = stop;
    }
    if (previous) {
      await this.page.keyboard.press("Tab");
      const baseline = await this.baselineOf(previous);
      previous.indicatorVisible = baseline ? baseline !== previous.indicator : null;
    }
    if (!closed) this.problem("tab-cycle-incomplete", { screen: label, message: `focus did not come back round within ${stops.length} stops` });
    for (const stop of stops) {
      if (!stop.name) this.problem("unnamed-control", { screen: label, stop });
      if (stop.indicatorVisible === false) this.problem("no-focus-indicator", { screen: label, stop });
      // The element could not be measured unfocused (it left the tree, or was replaced): unknown counts as unproven.
      if (stop.indicatorVisible === null) this.problem("focus-indicator-unknown", { screen: label, stop });
      if (!stop.onScreen) this.problem("focus-off-screen", { screen: label, stop });
    }
    return stops;
  }

  async axe(scheme) {
    if (scheme === "dark") {
      await this.page.evaluate(() => document.documentElement.classList.add("dark"));
      // transition-colors is mid-flight right after the toggle; axe would report phantom contrast failures.
      await this.page.waitForTimeout(450);
    }
    // Entrance animations are still fading in right after a navigation, and axe reads the faded colour as the
    // text colour. Wait for every finite animation to finish (the decorative loops never do, and do not fade).
    await this.page.evaluate(() =>
      Promise.race([
        Promise.all(
          document
            .getAnimations()
            .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
            .map((animation) => animation.finished.catch(() => undefined)),
        ),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]),
    );
    try {
      const results = await this.page.evaluate(
        async ({ tags, exclude }) => {
          const run = await window.axe.run({ exclude }, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations", "incomplete"] });
          // axe cannot parse the oklch() colours Tailwind v4 emits for its palette (it gives up on the packet's
          // whole sheet), so those nodes get the same 4.5:1 / 3:1 check here, with the browser doing the parsing.
          const canvas = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
          const rgba = (css) => {
            canvas.clearRect(0, 0, 1, 1);
            canvas.fillStyle = css;
            canvas.fillRect(0, 0, 1, 1);
            return Array.from(canvas.getImageData(0, 0, 1, 1).data);
          };
          const luminance = ([r, g, b]) => {
            const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
            return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
          };
          const blend = (top, under) => {
            const a = top[3] / 255;
            return [0, 1, 2].map((i) => Math.round(top[i] * a + under[i] * (1 - a))).concat(255);
          };
          const backgroundOf = (el) => {
            let colour = [255, 255, 255, 0];
            const layers = [];
            for (let node = el; node; node = node.parentElement) {
              const layer = rgba(getComputedStyle(node).backgroundColor);
              if (layer[3] > 0) layers.push(layer);
              if (layer[3] === 255) break;
            }
            for (const layer of layers.reverse()) colour = blend(layer, colour[3] === 0 ? [255, 255, 255, 255] : colour);
            return colour[3] === 0 ? [255, 255, 255, 255] : colour;
          };
          /** The text's own alpha and every ancestor's opacity thin the foreground before it meets the background. */
          const opacityOf = (el) => {
            let opacity = 1;
            for (let node = el; node; node = node.parentElement) opacity *= parseFloat(getComputedStyle(node).opacity);
            return opacity;
          };
          const contrastFallback = { checked: 0, failures: [] };
          for (const rule of run.incomplete) {
            if (rule.id !== "color-contrast") continue;
            for (const node of rule.nodes) {
              if (![...node.any, ...node.all].some((c) => /Could not parse color/.test(c.message))) continue;
              const el = document.querySelector(node.target[0]);
              if (!el) continue;
              const style = getComputedStyle(el);
              const bg = backgroundOf(el);
              const raw = rgba(style.color);
              const fg = blend([raw[0], raw[1], raw[2], Math.round(raw[3] * opacityOf(el))], bg);
              const l1 = luminance(fg);
              const l2 = luminance(bg);
              const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
              const size = parseFloat(style.fontSize);
              const bold = parseInt(style.fontWeight, 10) >= 700;
              const large = size >= 24 || (size >= 18.66 && bold);
              contrastFallback.checked += 1;
              if (ratio < (large ? 3 : 4.5)) contrastFallback.failures.push({ target: node.target.join(" "), ratio: Math.round(ratio * 100) / 100, fg: style.color, bg: `rgb(${bg.slice(0, 3).join(",")})`, size });
            }
          }
          return {
            contrastFallback,
            violations: run.violations.map((v) => ({
              id: v.id,
              impact: v.impact,
              help: v.help,
              tags: v.tags.filter((t) => /^wcag|best-practice/.test(t)),
              nodes: v.nodes.slice(0, 8).map((n) => ({ target: n.target.join(" "), summary: n.failureSummary?.replace(/\s+/g, " ").slice(0, 300) })),
            })),
            incomplete: run.incomplete.map((v) => ({
              id: v.id,
              impact: v.impact,
              nodes: v.nodes.length,
              reasons: [...new Set(v.nodes.flatMap((n) => [...n.any, ...n.all].map((c) => c.message)))].slice(0, 4),
              sample: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
            })),
            rulesPassed: run.passes.length,
          };
        },
        { tags: AXE_TAGS, exclude: AXE_EXCLUDE },
      );
      return results;
    } finally {
      if (scheme === "dark") {
        await this.page.evaluate(() => document.documentElement.classList.remove("dark"));
        await this.page.waitForTimeout(450);
      }
    }
  }

  /** Records one screen (or state of a screen): Tab order plus axe in both schemes. */
  async screen(label, { cycle = true } = {}) {
    if (this.seen.has(label)) throw new Error(`screen label used twice: ${label}`);
    this.seen.add(label);
    await this.page.addScriptTag({ content: axe.source }).catch(() => {});
    const url = new URL(this.page.url()).pathname;
    const entry = { journey: this.journey, label, url, stops: [], axe: {} };
    if (cycle) entry.stops = await this.tabCycle(label);
    for (const scheme of ["light", "dark"]) {
      const result = await this.axe(scheme);
      entry.axe[scheme] = result;
      for (const violation of result.violations) {
        this.problem("axe", { screen: label, scheme, gating: GATING_IMPACTS.has(violation.impact), ...violation });
      }
      if (result.contrastFallback.failures.length) {
        this.problem("axe", { screen: label, scheme, gating: true, id: "color-contrast (oklch fallback)", impact: "serious", help: "Text must have a 4.5:1 (3:1 large) contrast against its background", nodes: result.contrastFallback.failures.map((f) => ({ target: f.target, summary: `${f.ratio}:1 ${f.fg} on ${f.bg} at ${f.size}px` })) });
      }
    }
    report.screens.push(entry);
    const gating = Object.values(entry.axe).flatMap((r) => r.violations.filter((v) => GATING_IMPACTS.has(v.impact)));
    const fallback = entry.axe.light.contrastFallback.checked + entry.axe.dark.contrastFallback.checked;
    console.log(`  ${label.padEnd(28)} ${url.padEnd(12)} stops=${String(entry.stops.length).padStart(3)} axe: ${gating.length ? `${gating.length} critical/serious` : "clean"}${result(entry)}${fallback ? ` (${fallback} oklch contrast checks by hand)` : ""}`);
    return entry;
  }
}

function result(entry) {
  const minor = Object.values(entry.axe).flatMap((r) => r.violations.filter((v) => !GATING_IMPACTS.has(v.impact)));
  return minor.length ? ` (+${minor.length} moderate/minor)` : "";
}

/** A page whose mouse cannot be used: any pointer call is a bug in the audit itself. */
async function keyboardOnlyPage(context) {
  const page = await context.newPage();
  for (const method of ["click", "dblclick", "hover", "tap", "dragAndDrop"]) {
    page[method] = () => {
      throw new Error(`mouse disabled: page.${method} used`);
    };
  }
  for (const method of ["click", "dblclick", "move", "down", "up", "wheel"]) {
    page.mouse[method] = () => {
      throw new Error(`mouse disabled: mouse.${method} used`);
    };
  }
  await page.addInitScript(() => {
    window.__printed = 0;
    window.print = () => {
      window.__printed += 1;
    };
    /**
     * What a sighted keyboard user could see change when an element takes focus: its own drawn outline, shadow,
     * border and background, and the same on the three nearest ancestors (a radio's ring is drawn on its label
     * card). An outline whose style is none, whatever its colour, draws nothing and does not count.
     */
    window.__a11yIndicator = (el) => {
      const parts = [];
      for (let node = el, depth = 0; node && node !== document.body && depth < 4; node = node.parentElement, depth += 1) {
        const style = getComputedStyle(node);
        const outline = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0 ? `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}` : "";
        parts.push([outline, style.boxShadow, style.borderColor, style.backgroundColor, style.color, style.textDecorationLine].join("|"));
      }
      return parts.join(" / ");
    };
  });
  page.on("pageerror", (error) => report.problems.push({ kind: "page-error", message: String(error).slice(0, 300) }));
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|Failed to load resource/.test(message.text())) {
      report.problems.push({ kind: "console-error", message: message.text().slice(0, 300) });
    }
  });
  return page;
}

async function main() {
  mkdirSync(REPORT_DIR, { recursive: true });
  let failed = false;
  const all = ["single-document", "compare-versions", "help-safety-not-found"];
  const wanted = process.env.A11Y_JOURNEYS === undefined ? all : process.env.A11Y_JOURNEYS.split(",").map((name) => name.trim()).filter(Boolean);
  const unknown = wanted.filter((name) => !all.includes(name));
  if (wanted.length === 0 || unknown.length) {
    console.error(`A11Y_JOURNEYS must name at least one of: ${all.join(", ")}${unknown.length ? ` (unknown: ${unknown.join(", ")})` : ""}`);
    process.exit(2);
  }
  for (const journey of all.filter((name) => wanted.includes(name))) {
    console.log(`\n${journey}`);
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, baseURL: BASE_URL, acceptDownloads: true });
    const page = await keyboardOnlyPage(context);
    const auditor = new Auditor(page, journey);
    try {
      await runJourney(journey, page, auditor);
      const recorded = report.screens.filter((screen) => screen.journey === journey).length;
      if (recorded === 0) throw new Error("journey ran to the end but recorded no screen");
      report.journeys.push({ journey, completed: true, screens: recorded });
    } catch (error) {
      failed = true;
      report.journeys.push({ journey, completed: false, error: String(error?.stack ?? error).slice(0, 2000) });
      console.error(`  ✗ ${journey} stopped: ${String(error?.message ?? error).split("\n")[0]}`);
      const alerts = await page.$$eval('[role="alert"], [aria-live]', (nodes) => nodes.map((n) => n.textContent.trim()).filter(Boolean)).catch(() => []);
      if (alerts.length) console.error(`    on screen: ${alerts.join(" | ").slice(0, 400)}`);
      await page.screenshot({ path: join(REPORT_DIR, `${journey}-failure.png`), fullPage: true }).catch(() => {});
    } finally {
      await context.close();
    }
  }
  await browser.close();

  writeFileSync(join(REPORT_DIR, "report.json"), JSON.stringify(report, null, 2));
  writeFileSync(join(REPORT_DIR, "tab-order.md"), tabOrderMarkdown());

  const gating = report.problems.filter((p) => p.kind !== "axe" || p.gating);
  const advisory = report.problems.filter((p) => p.kind === "axe" && !p.gating);
  if (report.screens.length === 0) {
    failed = true;
    console.error("no screen was audited");
  }
  console.log(`\n${report.screens.length} screens · ${report.problems.length} findings (${gating.length} gating, ${advisory.length} advisory)`);
  for (const problem of report.problems) {
    const where = problem.screen ? `${problem.screen}${problem.scheme ? ` [${problem.scheme}]` : ""}` : problem.journey ?? "";
    const what = problem.kind === "axe" ? `${problem.impact} ${problem.id}: ${problem.help} → ${problem.nodes.map((n) => n.target).join(" | ")}` : problem.stop ? `${problem.stop.tag} ${problem.stop.testid ?? problem.stop.name}` : problem.message;
    console.log(`  ${problem.kind === "axe" && !problem.gating ? "·" : "✗"} ${problem.kind} @ ${where}: ${what}`);
  }
  console.log(`\nreport: ${join(REPORT_DIR, "report.json")}`);
  process.exit(failed || gating.length ? 1 : 0);
}

function tabOrderMarkdown() {
  const lines = ["# Tab order by screen", "", `Base URL ${report.baseUrl}, ${report.startedAt}.`, ""];
  for (const screen of report.screens) {
    lines.push(`## ${screen.label} (${screen.url}, ${screen.journey})`, "");
    screen.stops.forEach((stop, index) => {
      const marks = [stop.indicatorVisible === false ? "NO INDICATOR" : "", stop.name ? "" : "NO NAME", stop.onScreen ? "" : "OFF SCREEN"].filter(Boolean).join(", ");
      lines.push(`${index + 1}. \`${stop.tag}${stop.role ? `[role=${stop.role}]` : ""}\` ${stop.name || "—"}${stop.testid ? ` (${stop.testid})` : ""}${marks ? ` **${marks}**` : ""}`);
    });
    lines.push("");
  }
  return lines.join("\n");
}

await main();
