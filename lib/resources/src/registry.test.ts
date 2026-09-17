import { describe, expect, it } from "vitest";
import { GUIDANCE_KEYS } from "@workspace/rules";
import { describeLanguageViolation, findLanguageViolations } from "@workspace/grounding";
import {
  CONCERN_IDS,
  RESOURCES,
  ROUTING,
  checkReferences,
  isOfficialUrl,
  officialHost,
  resourceById,
  resourceForGuidance,
  resourceSchema,
  resourcesFor,
  suggestConcern,
  type Resource,
} from "./index";

/**
 * The registry is reviewed data (PRD FR-10): these tests are the review's
 * mechanical half. Importing `./index` already proves the files parse and
 * cross-reference; the rest pins what the cards rely on, so a bad edit to
 * `data/resources/` fails here rather than in front of a reader.
 */

/** Every sentence a card can show from an entry. */
function sentencesOf(resource: Resource): string[] {
  const out = [resource.name, resource.runBy, resource.summary];
  if (resource.whoItIsFor !== undefined) out.push(resource.whoItIsFor);
  if (resource.hours !== undefined) out.push(resource.hours);
  for (const contact of resource.contacts) {
    out.push(contact.label);
    if (contact.note !== undefined) out.push(contact.note);
  }
  return out;
}

// A check is dated in the reviewer's own calendar, which can be a day ahead of UTC's; anything later than that is a typo.
const latestPlausibleCheck = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe("the resource registry", () => {
  it("has the national anchors the PRD names, and nothing without a source and a check date", () => {
    const ids = RESOURCES.map((resource) => resource.id);
    expect(ids).toContain("nalsa-legal-aid");
    expect(ids).toContain("tele-law");
    for (const resource of RESOURCES) {
      expect(resource.sourceUrl, resource.id).toMatch(/^https:\/\//);
      expect(isOfficialUrl(resource.sourceUrl), `${resource.id} source host`).toBe(true);
      expect(resource.lastChecked, `${resource.id} lastChecked`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(resource.lastChecked <= latestPlausibleCheck, `${resource.id} was checked in the future`).toBe(true);
    }
  });

  it("only points at official hosts, whether as a source or as a link on the card", () => {
    for (const resource of RESOURCES) {
      for (const contact of resource.contacts) {
        if (contact.kind === "web") expect(officialHost(contact.url), `${resource.id}: ${contact.url}`).not.toBeNull();
      }
    }
  });

  it("is frozen: nothing at runtime can add, drop or reword an entry", () => {
    expect(Object.isFrozen(RESOURCES)).toBe(true);
    expect(Object.isFrozen(RESOURCES[0].contacts)).toBe(true);
    expect(Object.isFrozen(ROUTING.concerns)).toBe(true);
    expect(() => {
      (RESOURCES as Resource[]).push(RESOURCES[0]);
    }).toThrow();
  });

  it("describes each service in the review register: no verdicts, no conclusions about the reader", () => {
    const failures: string[] = [];
    for (const resource of RESOURCES) {
      for (const sentence of sentencesOf(resource)) {
        for (const violation of findLanguageViolations(sentence)) {
          failures.push(`${resource.id}: ${describeLanguageViolation(violation)} in "${sentence}"`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("never claims that ClauseCompass is connected to a service", () => {
    const affiliation = /\b(?:partner(?:s|ed|ship)?|affiliat\w*|in association with|in collaboration with|powered by|on behalf of|authori[sz]ed by|endorsed by|our (?:app|service|team|helpline))\b/i;
    for (const resource of RESOURCES) {
      for (const sentence of sentencesOf(resource)) {
        expect(sentence, resource.id).not.toMatch(affiliation);
        expect(sentence, resource.id).not.toMatch(/ClauseCompass/);
      }
    }
  });
});

describe("routing", () => {
  it("gives every concern at least one entry, all of them from the registry, in the table's order", () => {
    for (const concern of CONCERN_IDS) {
      const shown = resourcesFor(concern);
      expect(shown.length, concern).toBeGreaterThan(0);
      expect(shown.map((resource) => resource.id)).toEqual(ROUTING.concerns[concern]);
      for (const resource of shown) expect(resourceById(resource.id)).toBe(resource);
    }
  });

  it("puts Tele-Law and NALSA on every concern that is a legal question", () => {
    for (const concern of ["legal-advice", "rent", "work"] as const) {
      const ids = resourcesFor(concern).map((resource) => resource.id);
      expect(ids, concern).toContain("tele-law");
      expect(ids, concern).toContain("nalsa-legal-aid");
    }
  });

  it("resolves every guidance key of the safety escalation to a phone number", () => {
    for (const key of GUIDANCE_KEYS) {
      const resource = resourceForGuidance(key);
      expect(resource.contacts.some((contact) => contact.kind === "phone"), key).toBe(true);
    }
    expect(resourceForGuidance("emergency-services").contacts[0]).toMatchObject({ kind: "phone", number: "112" });
  });

  it("preselects a concern from the document type, and the general list otherwise", () => {
    expect(suggestConcern("rental")).toBe("rent");
    expect(suggestConcern("offer_letter")).toBe("work");
    expect(suggestConcern("nda")).toBe("legal-advice");
    expect(suggestConcern(undefined)).toBe("legal-advice");
    expect(suggestConcern(null)).toBe("legal-advice");
  });
});

describe("the schema and the cross-check", () => {
  const base = RESOURCES[0];

  it("rejects a link that is not on an official host, and an http one", () => {
    expect(isOfficialUrl("https://nalsa.gov.in/")).toBe(true);
    expect(isOfficialUrl("https://scourtapp.nic.in/lsams/")).toBe(true);
    expect(isOfficialUrl("https://www.tele-law.in/faq.html")).toBe(true);
    expect(isOfficialUrl("http://nalsa.gov.in/")).toBe(false);
    expect(isOfficialUrl("https://nalsa.gov.in.example.com/")).toBe(false);
    expect(isOfficialUrl("https://example.com/gov.in")).toBe(false);
    expect(isOfficialUrl("https://user@nalsa.gov.in/")).toBe(false);
    expect(resourceSchema.safeParse({ ...base, sourceUrl: "https://example.com/legal-aid" }).success).toBe(false);
    expect(resourceSchema.safeParse({ ...base, contacts: [{ kind: "web", url: "https://example.com/", label: "x" }] }).success).toBe(false);
  });

  it("rejects a check date that is not a real day, and an entry with fields it does not know", () => {
    expect(resourceSchema.safeParse({ ...base, lastChecked: "2026-02-30" }).success).toBe(false);
    expect(resourceSchema.safeParse({ ...base, lastChecked: "15/09/2026" }).success).toBe(false);
    expect(resourceSchema.safeParse({ ...base, verified: true }).success).toBe(false);
    expect(resourceSchema.safeParse({ ...base, contacts: [] }).success).toBe(false);
  });

  it("names dangling and unreachable ids", () => {
    const routing = {
      concerns: { ...ROUTING.concerns, cyber: ["nowhere", "erss-112", "erss-112"] },
      guidance: { ...ROUTING.guidance, police: "missing" },
    };
    const problems = checkReferences([...RESOURCES, { id: "orphan" }, { id: "tele-law" }], routing);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('unknown resource "nowhere"'),
        expect.stringContaining('lists resource "erss-112" twice'),
        expect.stringContaining('guidance key "police" routes to unknown resource "missing"'),
        expect.stringContaining('resource "orphan" is not reachable'),
        expect.stringContaining('resource id "tele-law" is listed more than once'),
      ]),
    );
    expect(checkReferences(RESOURCES, ROUTING)).toEqual([]);
  });
});
