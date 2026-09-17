import type { DocumentTypeId, GuidanceKey } from "@workspace/rules";
import resourcesJson from "../../../data/resources/resources.json";
import routingJson from "../../../data/resources/routing.json";
import { isConcernId, registrySchema, routingSchema, type ConcernId, type Resource, type Routing } from "./schema";

/**
 * The registry as the app uses it: `data/resources/*.json` parsed against the
 * schema and cross-checked once, at import, then frozen. It is bundled into
 * the web app rather than served by the API because it is small, static,
 * reviewed data that a reader may need precisely when the API is not
 * reachable; a broken file therefore fails the build and the tests, never a
 * reader's request. Nothing here is produced by a model: the cards render
 * these entries and no others.
 */

/**
 * The problems a schema cannot see on its own: routing rows that point at
 * entries that do not exist, entries that nothing routes to, and an entry
 * listed twice in one row. Returned rather than thrown so the tests can
 * exercise the check with synthetic data.
 */
export function checkReferences(resources: readonly Pick<Resource, "id">[], routing: Routing): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const resource of resources) {
    if (ids.has(resource.id)) problems.push(`resource id "${resource.id}" is listed more than once`);
    ids.add(resource.id);
  }
  const referenced = new Set<string>();
  for (const [concern, list] of Object.entries(routing.concerns)) {
    const seen = new Set<string>();
    for (const id of list) {
      if (!ids.has(id)) problems.push(`concern "${concern}" routes to unknown resource "${id}"`);
      if (seen.has(id)) problems.push(`concern "${concern}" lists resource "${id}" twice`);
      seen.add(id);
      referenced.add(id);
    }
  }
  for (const [key, id] of Object.entries(routing.guidance)) {
    if (!ids.has(id)) problems.push(`guidance key "${key}" routes to unknown resource "${id}"`);
    referenced.add(id);
  }
  for (const id of ids) {
    if (!referenced.has(id)) problems.push(`resource "${id}" is not reachable from any concern or guidance key`);
  }
  return problems;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as object)) deepFreeze(child);
  }
  return value;
}

function load(): { resources: readonly Resource[]; routing: Routing } {
  const registry = registrySchema.safeParse(resourcesJson);
  if (!registry.success) throw new Error(`data/resources/resources.json does not match the schema:\n${registry.error.message}`);
  const routing = routingSchema.safeParse(routingJson);
  if (!routing.success) throw new Error(`data/resources/routing.json does not match the schema:\n${routing.error.message}`);
  const problems = checkReferences(registry.data.resources, routing.data);
  if (problems.length > 0) throw new Error(`data/resources is inconsistent:\n- ${problems.join("\n- ")}`);
  return { resources: deepFreeze(registry.data.resources), routing: deepFreeze(routing.data) };
}

const loaded = load();

/** Every entry in the registry, in file order. */
export const RESOURCES: readonly Resource[] = loaded.resources;
export const ROUTING: Routing = loaded.routing;

const byId = new Map(RESOURCES.map((resource) => [resource.id, resource]));

function mustFind(id: string): Resource {
  const resource = byId.get(id);
  // Unreachable once load() has passed; kept so a caller sees the id, not "undefined".
  if (resource === undefined) throw new Error(`no resource with id "${id}"`);
  return resource;
}

export function resourceById(id: string): Resource | null {
  return byId.get(id) ?? null;
}

/** The entries to show for a concern, in the order the routing table lists them. */
export function resourcesFor(concern: ConcernId): readonly Resource[] {
  if (!isConcernId(concern)) throw new Error(`resources: unknown concern "${String(concern)}"`);
  return ROUTING.concerns[concern].map(mustFind);
}

/** The entry behind one guidance key of the decision flow's safety escalation. */
export function resourceForGuidance(key: GuidanceKey): Resource {
  return mustFind(ROUTING.guidance[key]);
}

/**
 * The concern to preselect from what the journey already knows. Only the
 * document type is telling: a rental agreement is about rent, an offer
 * letter about work; anything else (an NDA, or no type yet) starts at the
 * general legal-advice list. The reader changes it in one click either way.
 */
export function suggestConcern(documentType: DocumentTypeId | null | undefined): ConcernId {
  switch (documentType) {
    case "rental":
      return "rent";
    case "offer_letter":
      return "work";
    default:
      return "legal-advice";
  }
}
