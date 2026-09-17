import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { describeLanguageViolation, findLanguageViolations } from "@workspace/grounding";
import { RESOURCES, resourceForGuidance } from "@workspace/resources";
import {
  GUIDANCE_KEYS,
  INITIAL_FLOW_STATE,
  SAFETY_CATEGORIES,
  decide,
  describeState,
  detectSafetyCues,
  transition,
  type FlowState,
  type SafetyEscalation,
} from "@workspace/rules";
import { copy } from "@/features/journey/copy";
import { SAFETY_PATH, flowFor, isEscalated, nextScreen, parseStoredEscalation, say, storedEscalation, todayIso } from "@/features/journey/flow";
import { SAMPLE_ANSWERS } from "@/features/journey/sample-answers";
import { STAGES } from "@/features/journey/stages";
import { SafetyGuidance } from "@/features/safety/safety-guidance";

/**
 * The safety-escalation screen's acceptance (Task 5.3, PRD §8): a fixture
 * answer that carries the escalation trigger routes straight to the safety
 * screen, and document analysis is skipped. The route decision and the
 * flow's state are pure functions, checked here exactly as the interview
 * screen calls them; the screen's body is rendered without a DOM to check
 * what it links to. The fixture file is the same one the interview screen
 * offers as sample answers, so what the demo shows is what is pinned here.
 * The mounted journey — provider, guards, interview screen — is driven in
 * escalation-routing.test.tsx.
 */

interface Fixture {
  id: string;
  title: string;
  text: string;
  expect: { status: string; category?: string; guidance?: string[] };
}

const fixtures: Fixture[] = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../../samples/interview-answers.json"), "utf8")).answers;
const clock = { today: "2026-09-15" };
const escalating = fixtures.filter((fixture) => fixture.expect.status === "safety-escalation");
const calm = fixtures.filter((fixture) => fixture.expect.status !== "safety-escalation");

const JOURNEY_PATHS = ["/upload", "/interview", "/map", "/review", "/compare", "/packet"];

function decodeEntities(text: string): string {
  return text.replaceAll("&amp;", "&").replaceAll("&#x27;", "'").replaceAll("&quot;", '"');
}

function hrefs(markup: string): string[] {
  return [...markup.matchAll(/href="([^"]*)"/g)].map((match) => decodeEntities(match[1]));
}

describe("the interview fixtures", () => {
  it("cover both branches, with every escalation category, and match what the client offers", () => {
    expect(escalating.length).toBeGreaterThan(0);
    expect(calm.length).toBeGreaterThan(0);
    expect(new Set(escalating.map((fixture) => fixture.expect.category))).toEqual(new Set(SAFETY_CATEGORIES));
    expect(SAMPLE_ANSWERS.map(({ id, title, text }) => ({ id, title, text }))).toEqual(fixtures.map(({ id, title, text }) => ({ id, title, text })));
    expect(new Set(fixtures.map((fixture) => fixture.id)).size).toBe(fixtures.length);
  });

  it.each(fixtures.map((fixture) => [fixture.id, fixture] as const))("%s decides as the fixture says, in every stage", (_id, fixture) => {
    for (const { id: stage } of STAGES) {
      const decision = decide({ stage, userTexts: [{ text: fixture.text, origin: "interview" }] }, clock);
      expect(decision.status).toBe(fixture.expect.status);
      if (fixture.expect.status === "safety-escalation") {
        expect(decision.safety?.category).toBe(fixture.expect.category);
        expect(decision.safety?.guidance).toEqual(fixture.expect.guidance);
        expect(decision.documentAnalysis).toBe("skip");
      } else {
        expect(decision.safety).toBeNull();
        expect(decision.documentAnalysis).toBe("run");
      }
    }
  });
});

describe("the route the interview takes on Continue", () => {
  it.each(escalating.map((fixture) => [fixture.id, fixture] as const))("%s goes to the safety screen, whichever screen was intended", (_id, fixture) => {
    for (const { id: stage } of STAGES) {
      const flow = say(flowFor(stage), fixture.text, "interview", clock);
      const decision = describeState(flow);
      expect(isEscalated(flow)).toBe(true);
      expect(decision.documentAnalysis).toBe("skip");
      expect(nextScreen(decision, "/map")).toBe(SAFETY_PATH);
      expect(nextScreen(decision, "/compare")).toBe(SAFETY_PATH);
    }
  });

  it.each(escalating.map((fixture) => [fixture.id, fixture] as const))("%s escalates without keeping the words that matched", (_id, fixture) => {
    const matched = detectSafetyCues(fixture.text).map((cue) => cue.matched);
    expect(matched.length).toBeGreaterThan(0);
    const flow = say(flowFor("problem-started"), fixture.text, "interview", clock);
    expect(flow.safety?.cues).toEqual([]);
    const held = JSON.stringify(flow);
    for (const words of matched) expect(held).not.toContain(words);
  });

  it.each(calm.map((fixture) => [fixture.id, fixture] as const))("%s goes where it was heading, and leaves the flow as it was", (_id, fixture) => {
    const before = flowFor("problem-started");
    const flow = say(before, fixture.text, "interview", clock);
    expect(flow).toBe(before);
    expect(nextScreen(describeState(flow), "/map")).toBe("/map");
  });

  it("stays on the safety screen once there: later words and a second stage choice through the flow change nothing", () => {
    const flow = say(flowFor("before-signing"), escalating[0].text, "interview", clock);
    expect(transition(flow, { type: "user-said", text: calm[0].text, origin: "interview" }, clock)).toBe(flow);
    expect(transition(flow, { type: "stage-chosen", stage: "compare-versions" }, clock)).toBe(flow);
    expect(flowFor("compare-versions")).toEqual(transition(INITIAL_FLOW_STATE, { type: "stage-chosen", stage: "compare-versions" }, clock));
  });
});

describe("the escalation kept across a refresh", () => {
  const stored = (): SafetyEscalation => {
    const flow = say(flowFor("problem-started"), escalating[0].text, "interview", clock);
    if (flow.safety === null) throw new Error("fixture did not escalate");
    return flow.safety;
  };

  it("is written without cues, round-trips through JSON and restores an escalated flow for the stored stage", () => {
    const safety = stored();
    const written = storedEscalation(safety);
    expect(written).toEqual({ category: safety.category, guidance: safety.guidance, origin: "interview" });
    expect(storedEscalation(null)).toBeNull();
    const restored = parseStoredEscalation(JSON.parse(JSON.stringify(written)));
    expect(restored).toEqual({ ...written, cues: [] });
    const flow: FlowState = flowFor("problem-started", restored);
    expect(isEscalated(flow)).toBe(true);
    expect(flow.stage).toBe("problem-started");
    expect(describeState(flow).documentAnalysis).toBe("skip");
  });

  it("reads anything that is not the stored shape as no escalation", () => {
    const written = storedEscalation(stored());
    expect(parseStoredEscalation(null)).toBeNull();
    expect(parseStoredEscalation("safety-escalation")).toBeNull();
    expect(parseStoredEscalation({ ...written, category: "hardball" })).toBeNull();
    expect(parseStoredEscalation({ ...written, guidance: ["legal-aid"] })).toBeNull();
    expect(parseStoredEscalation({ ...written, guidance: [] })).toBeNull();
    expect(parseStoredEscalation({ ...written, origin: "document" })).toBeNull();
    // The machine's full shape, cues included, is not what is written; a stray copy of it does not restore either.
    expect(parseStoredEscalation({ ...written, cues: [] })).toBeNull();
    expect(parseStoredEscalation({ ...written, extra: true })).toBeNull();
    expect(isEscalated(flowFor("problem-started", null))).toBe(false);
  });

  it("dates the flow's clock by the reader's calendar day", () => {
    expect(todayIso(new Date(2026, 8, 15, 23, 30))).toBe("2026-09-15");
    expect(todayIso(new Date(2026, 0, 1, 0, 5))).toBe("2026-01-01");
  });
});

describe("the safety screen's body", () => {
  const registryHrefs = new Set<string>();
  for (const resource of RESOURCES) {
    registryHrefs.add(resource.sourceUrl);
    for (const contact of resource.contacts) {
      if (contact.kind === "web") registryHrefs.add(contact.url);
      else registryHrefs.add(`${contact.kind === "phone" ? "tel" : "sms"}:${contact.number.replace(/\D/g, "")}`);
    }
  }

  it.each(escalating.map((fixture) => [fixture.id, fixture] as const))("for %s leads with the primary route's number and links only to the registry", (_id, fixture) => {
    const flow = say(flowFor("before-signing"), fixture.text, "interview", clock);
    if (flow.safety === null) throw new Error("fixture did not escalate");
    const markup = decodeEntities(renderToStaticMarkup(createElement(SafetyGuidance, { safety: flow.safety })));
    const links = hrefs(markup);

    const lead = resourceForGuidance(flow.safety.guidance[0]);
    const leadPhone = lead.contacts.find((contact) => contact.kind === "phone");
    if (leadPhone === undefined || leadPhone.kind !== "phone") throw new Error(`${lead.id} has no phone number`);
    expect(links[0]).toBe(`tel:${leadPhone.number.replace(/\D/g, "")}`);
    expect(markup).toContain(copy.safety.call(leadPhone.number));
    expect(markup).toContain(copy.safety.categories[flow.safety.category].heading);

    for (const link of links) expect(registryHrefs.has(link), `link ${link} is not in the registry`).toBe(true);
    for (const journeyPath of JOURNEY_PATHS) expect(links).not.toContain(journeyPath);

    for (const key of flow.safety.guidance) expect(markup).toContain(resourceForGuidance(key).name);
    // Nothing the reader typed comes back on screen.
    for (const cue of detectSafetyCues(fixture.text)) expect(markup).not.toContain(cue.matched);
    expect(markup).not.toContain(fixture.text);
  });

  it("has a heading for every escalation category and a card route for every guidance key", () => {
    for (const category of SAFETY_CATEGORIES) expect(copy.safety.categories[category].heading.length).toBeGreaterThan(0);
    for (const key of GUIDANCE_KEYS) expect(resourceForGuidance(key).contacts.some((contact) => contact.kind === "phone")).toBe(true);
  });
});

describe("the safety and interview copy", () => {
  const SAMPLE_ARGS: unknown[][] = [["112"], ["A threat of violence"], [30]];

  function strings(value: unknown, sampleArgs: unknown[][] = SAMPLE_ARGS): string[] {
    if (typeof value === "string") return [value];
    if (typeof value === "function") {
      return sampleArgs.flatMap((args) => {
        try {
          const result = (value as (...args: unknown[]) => unknown)(...args);
          return typeof result === "string" ? [result] : [];
        } catch {
          return [];
        }
      });
    }
    if (Array.isArray(value)) return value.flatMap((item) => strings(item, sampleArgs));
    if (value && typeof value === "object") return Object.values(value).flatMap((item) => strings(item, sampleArgs));
    return [];
  }

  const sentences = [...strings(copy.safety), ...strings(copy.interview.situation), ...fixtures.map((fixture) => fixture.title)];

  it("stays in the review register", () => {
    expect(sentences.length).toBeGreaterThan(20);
    for (const sentence of sentences) {
      const violations = findLanguageViolations(sentence);
      expect(violations.map(describeLanguageViolation), sentence).toEqual([]);
    }
  });

  it("claims no connection with any service and names no number itself", () => {
    const affiliation = /\b(?:partner(?:s|ed|ship)?|affiliat\w*|in association with|in collaboration with|powered by|on behalf of|authori[sz]ed by|endorsed by|our (?:helpline|service)|official app)\b/i;
    for (const sentence of sentences) expect(sentence).not.toMatch(affiliation);
    const registryNumbers = RESOURCES.flatMap((resource) => resource.contacts.flatMap((contact) => (contact.kind === "web" ? [] : [contact.number])));
    // The retention sentence takes a minute count, not a number to dial; a sample count that is also a helpline would fail this for the wrong reason.
    const withCounts: unknown[][] = [[30]];
    for (const sentence of [...strings(copy.safety.categories), ...strings(copy.safety.why), ...strings(copy.safety.document, withCounts)]) {
      for (const number of registryNumbers) expect(sentence).not.toContain(number);
    }
  });

  it("has a back label for the safety screen on the official-help screen", () => {
    expect(copy.resources.backTo[SAFETY_PATH]).toBeTruthy();
  });
});
