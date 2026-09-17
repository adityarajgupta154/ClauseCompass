import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { describeLanguageViolation, findLanguageViolations } from "@workspace/grounding";
import { CONCERN_IDS, RESOURCES, isOfficialUrl, resourcesFor, type ConcernId } from "@workspace/resources";
import { copy } from "@/features/journey/copy";
import { ResourceCards, formatCheckedDate } from "@/features/resources/resource-cards";

/**
 * The official-help screen's acceptance (Task 5.2, FR-10), checked on the
 * markup the browser gets: cards render only registry entries, every card
 * shows when its entry was last checked and the line asking the reader to
 * confirm with the service, and no link on a card goes anywhere the registry
 * does not name. The page shell (radios, back link) is browser territory;
 * the cards are pure and rendered here without a DOM. The list takes a
 * concern and resolves the registry itself, so there is no prop through
 * which model text could arrive; the last test of the first block checks
 * that a forged concern is refused rather than rendered empty.
 */

const words = copy.resources.card;

/** Every URL the registry names, so a link on a card can be traced to its entry. */
const registryUrls = new Set<string>();
for (const resource of RESOURCES) {
  registryUrls.add(resource.sourceUrl);
  for (const contact of resource.contacts) if (contact.kind === "web") registryUrls.add(contact.url);
}

function renderCards(concern: ConcernId): string {
  return renderToStaticMarkup(createElement(ResourceCards, { concern }));
}

/** The markup of every entry, once each: the union of the concerns' lists. */
function renderEveryCard(): string {
  const seen = new Set<string>();
  const cards: string[] = [];
  for (const concern of CONCERN_IDS) {
    for (const [index, resource] of resourcesFor(concern).entries()) {
      if (seen.has(resource.id)) continue;
      seen.add(resource.id);
      cards.push(cardsOf(renderCards(concern))[index]);
    }
  }
  expect(seen.size).toBe(RESOURCES.length);
  return cards.join("");
}

/** The markup of each <article> on the page, in order. */
function cardsOf(markup: string): string[] {
  return markup.match(/<article[\s\S]*?<\/article>/g) ?? [];
}

function hrefs(markup: string): string[] {
  return [...markup.matchAll(/href="([^"]*)"/g)].map((match) => decodeEntities(match[1]));
}

function decodeEntities(text: string): string {
  return text.replaceAll("&amp;", "&").replaceAll("&#x27;", "'").replaceAll("&quot;", '"');
}

describe("the resource cards", () => {
  it("render one card per routed entry for every concern, and nothing that is not in the registry", () => {
    for (const concern of CONCERN_IDS) {
      const routed = resourcesFor(concern);
      const rendered = cardsOf(renderCards(concern));
      expect(rendered.length, concern).toBe(routed.length);
      routed.forEach((resource, index) => {
        expect(rendered[index], `${concern} #${index}`).toContain(`data-testid="card-resource-${resource.id}"`);
        expect(rendered[index]).toContain(resource.name);
      });
    }
  });

  it("carry a visible last-checked date and the confirm-with-the-service line on every card", () => {
    for (const card of cardsOf(renderEveryCard())) {
      const id = /data-testid="card-resource-([a-z0-9-]+)"/.exec(card)?.[1];
      const resource = RESOURCES.find((entry) => entry.id === id);
      expect(resource, `card ${id} has a registry entry`).toBeDefined();
      if (resource === undefined) continue;
      expect(card, resource.id).toContain(words.lastChecked(formatCheckedDate(resource.lastChecked)));
      expect(card, resource.id).toContain(words.confirm);
      // Neither line is hidden from sighted readers.
      expect(card).not.toMatch(new RegExp(`class="[^"]*sr-only[^"]*"[^>]*>[^<]*${words.confirm}`));
    }
  });

  it("link only to what the registry names: its official pages, and its numbers as tel: or sms: links", () => {
    const markup = renderEveryCard();
    const links = hrefs(markup);
    expect(links.length).toBeGreaterThan(0);
    for (const href of links) {
      if (href.startsWith("tel:") || href.startsWith("sms:")) {
        expect(href, href).toMatch(/^(?:tel|sms):\d+$/);
        const number = href.slice(4);
        expect(
          RESOURCES.some((resource) => resource.contacts.some((contact) => contact.kind !== "web" && contact.number.replace(/\D/g, "") === number)),
          `${href} is a registry number`,
        ).toBe(true);
      } else {
        expect(registryUrls.has(href), `${href} is in the registry`).toBe(true);
        expect(isOfficialUrl(href)).toBe(true);
      }
    }
    // Every external link opens away from the session's tab and says so.
    const externalAnchors = markup.match(/<a [^>]*href="https:[^>]*>/g) ?? [];
    for (const anchor of externalAnchors) {
      expect(anchor).toContain('target="_blank"');
      expect(anchor).toContain('rel="noopener noreferrer"');
    }
    expect((markup.match(new RegExp(`\\(${words.opensInNewTab}\\)`, "g")) ?? []).length).toBe(externalAnchors.length);
  });

  it("refuse a concern the registry does not route instead of rendering an empty or improvised list", () => {
    expect(() => renderCards("anything" as ConcernId)).toThrow(/unknown concern "anything"/);
    expect(() => renderCards("" as ConcernId)).toThrow(/unknown concern/);
  });

  it("shows the check date as a calendar day, unshifted by the timezone", () => {
    expect(formatCheckedDate("2026-09-15")).toBe("15 September 2026");
    expect(formatCheckedDate("2026-01-01")).toBe("1 January 2026");
  });
});

/** Arguments the copy's sentence functions take: a count with a label, a date. */
const SAMPLE_ARGS: unknown[][] = [[1, "Rent, deposit or eviction"], [3, "Someone is in danger or being forced"], ["15 September 2026"]];

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") {
    return SAMPLE_ARGS.flatMap((args) => {
      try {
        const result = (value as (...args: unknown[]) => unknown)(...args);
        return typeof result === "string" ? [result] : [];
      } catch {
        return [];
      }
    });
  }
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

describe("the screen's own copy", () => {
  it("stays in the review register", () => {
    const violations = strings(copy.resources).flatMap((sentence) =>
      findLanguageViolations(sentence).map((violation) => `${describeLanguageViolation(violation)} in "${sentence}"`),
    );
    expect(violations).toEqual([]);
  });

  it("claims no connection with any service, and says so in the lead", () => {
    const affiliation = /\b(?:partner(?:s|ed|ship)?|affiliat\w*|in association with|in collaboration with|powered by|on behalf of|authori[sz]ed by|endorsed by|our (?:helpline|service)|official app)\b/i;
    for (const sentence of strings(copy.resources)) expect(sentence).not.toMatch(affiliation);
    expect(copy.resources.lead).toContain("not connected to any of them");
    expect(copy.resources.card.confirm).toBe("Confirm availability and eligibility with the service directly.");
  });

  it("has a label for every concern the registry routes", () => {
    for (const concern of CONCERN_IDS) {
      expect(copy.resources.concerns[concern].label.length).toBeGreaterThan(0);
      expect(copy.resources.concerns[concern].description.length).toBeGreaterThan(0);
    }
  });
});
