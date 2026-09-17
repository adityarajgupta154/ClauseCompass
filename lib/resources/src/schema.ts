import { z } from "zod";
import type { GuidanceKey } from "@workspace/rules";

/**
 * The shape of the curated resource registry in `data/resources/` (PRD FR-10,
 * section 10). The registry is data reviewed by a person, not anything a model
 * produced, and the schema is where the review rules become mechanical:
 *
 * - every place an entry points at is an https URL on an official host (a
 *   Government of India or NIC domain, or Tele-Law's own site), so a link
 *   that is not official cannot be added by mistake;
 * - every entry names the page it was checked against (`sourceUrl`) and the
 *   day that happened (`lastChecked`), which the UI shows on the card;
 * - the routing table is keyed by the concern ids the UI offers and by the
 *   guidance keys the decision flow emits, so a concern or a key without a
 *   resource behind it fails at import rather than at the moment a reader
 *   needs it.
 *
 * Text fields are what the card says about the service. They describe the
 * service in its own terms and never conclude anything about the reader:
 * the Responsible Language lint runs over them in the tests.
 */

/**
 * What the reader says the matter is about. Labels live in the UI's copy;
 * these ids key the routing table and the `concern` query parameter.
 */
export const CONCERN_IDS = ["legal-advice", "rent", "work", "consumer", "cyber", "safety"] as const;
export type ConcernId = (typeof CONCERN_IDS)[number];

export function isConcernId(value: unknown): value is ConcernId {
  return CONCERN_IDS.includes(value as ConcernId);
}

/** Hosts an entry may point at. Anything else is not an official source for this registry. */
const OFFICIAL_HOST_PATTERNS: readonly RegExp[] = [/(?:^|\.)gov\.in$/, /(?:^|\.)nic\.in$/, /^(?:www\.)?tele-law\.in$/];

/** The host of an https URL, lower-cased; null for anything else (including a URL with credentials or a port). */
export function officialHost(value: string): string | null {
  const match = /^https:\/\/([a-z0-9.-]+)(?:[/?#]|$)/i.exec(value);
  if (match === null) return null;
  const host = match[1].toLowerCase();
  return OFFICIAL_HOST_PATTERNS.some((pattern) => pattern.test(host)) ? host : null;
}

export function isOfficialUrl(value: string): boolean {
  return officialHost(value) !== null;
}

const officialUrl = z
  .string()
  .url()
  .refine(isOfficialUrl, { message: "must be an https URL on an official host (gov.in, nic.in or tele-law.in)" });

const text = z.string().trim().min(1);

/** A calendar date as YYYY-MM-DD; "2026-02-30" is rejected, not rolled over. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "must be a date written as YYYY-MM-DD" })
  .refine((value) => {
    const time = Date.parse(`${value}T00:00:00Z`);
    return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
  }, { message: "must be a real calendar date" });

/** A number as people dial it: digits, with hyphens allowed for readability ("1800-11-4000"). */
const dialable = z.string().regex(/^\d(?:[\d-]*\d)?$/, { message: "digits and hyphens only" });

export const RESOURCE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const resourceId = z.string().regex(RESOURCE_ID_PATTERN, { message: "lower-case words joined by hyphens" });

/** One way to reach a service. `phone` is dialled, `message` is texted (SMS or WhatsApp), `web` is opened. */
export const contactSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("phone"), number: dialable, label: text, note: text.optional() }).strict(),
  z.object({ kind: z.literal("message"), number: dialable, label: text, note: text.optional() }).strict(),
  z.object({ kind: z.literal("web"), url: officialUrl, label: text, note: text.optional() }).strict(),
]);
export type Contact = z.infer<typeof contactSchema>;

/** Where a service operates: the whole country, or one State or Union Territory (ISO 3166-2:IN code). */
export const scopeSchema = z.union([z.literal("national"), z.object({ state: z.string().regex(/^IN-[A-Z]{2,3}$/) }).strict()]);
export type Scope = z.infer<typeof scopeSchema>;

export const resourceSchema = z
  .object({
    id: resourceId,
    /** The service as a reader would recognise it, e.g. "Tele-Law". */
    name: text,
    /** Who operates it: the ministry, authority or programme. Shown on the card. */
    runBy: text,
    scope: scopeSchema,
    /** What the service does, in its own published terms. */
    summary: text,
    /** Who the service says it is for, when its published material says so. Never a conclusion about the reader. */
    whoItIsFor: text.optional(),
    /** Published hours, when the source states them. */
    hours: text.optional(),
    contacts: z.array(contactSchema).min(1),
    /** The official page the entry was checked against. */
    sourceUrl: officialUrl,
    /** The day that check was done. */
    lastChecked: isoDate,
  })
  .strict();
export type Resource = z.infer<typeof resourceSchema>;

export const registrySchema = z.object({ resources: z.array(resourceSchema).min(1) }).strict();
export type Registry = z.infer<typeof registrySchema>;

const resourceIds = z.array(resourceId).min(1);

// `satisfies` keeps these tables in step with the id lists: a concern or a
// guidance key added elsewhere without a row here fails to compile.
const concernRoutes = {
  "legal-advice": resourceIds,
  rent: resourceIds,
  work: resourceIds,
  consumer: resourceIds,
  cyber: resourceIds,
  safety: resourceIds,
} satisfies Record<ConcernId, typeof resourceIds>;

const guidanceRoutes = {
  "emergency-services": resourceId,
  police: resourceId,
  "women-helpline": resourceId,
  "child-helpline": resourceId,
  "mental-health-helpline": resourceId,
} satisfies Record<GuidanceKey, typeof resourceId>;

/**
 * Which entries a concern shows, in order, and which entry each guidance key
 * of the decision flow's safety escalation resolves to.
 */
export const routingSchema = z
  .object({
    concerns: z.object(concernRoutes).strict(),
    guidance: z.object(guidanceRoutes).strict(),
  })
  .strict();
export type Routing = z.infer<typeof routingSchema>;
