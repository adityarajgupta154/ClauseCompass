export {
  CONCERN_IDS,
  RESOURCE_ID_PATTERN,
  contactSchema,
  isConcernId,
  isOfficialUrl,
  officialHost,
  registrySchema,
  resourceSchema,
  routingSchema,
  scopeSchema,
} from "./schema";
export type { ConcernId, Contact, Registry, Resource, Routing, Scope } from "./schema";
export { RESOURCES, ROUTING, checkReferences, resourceById, resourceForGuidance, resourcesFor, suggestConcern } from "./registry";
