import type { PipelineStage } from "mongoose";
import Client from "@/models/Client";
import ClientContact from "@/models/ClientContact";
import Person from "@/models/Person";
import { clientCredentialAccess } from "@/lib/server/client-credentials";
import { CLIENT_IDENTITY_FIELDS, escapeSearchRegex, flexibleSearchPattern } from "@/lib/search/client-search";
type SearchStage = Exclude<PipelineStage, PipelineStage.Merge | PipelineStage.Out>;
const normalizedContactValues = (input: unknown, email = false) => ({ $map: {
  input: { $ifNull: [input, []] }, as: "detail",
  in: email ? { $toLower: { $trim: { input: "$$detail" } } } : { $trim: { input: "$$detail" } },
} });

export function buildSearchFieldConditions(fields: string[], search: string) {
  const patterns = [escapeSearchRegex(search.trim()), flexibleSearchPattern(search)].filter(Boolean);
  return fields.flatMap(field => patterns.map(pattern => ({ [field]: { $regex: pattern, $options: "i" } })));
}

export async function searchableClientCustomKeys() {
  return (await clientCredentialAccess(null)).searchableKeys;
}

// Joins each link to its current Person by indexed _id, with legacy missing
// selections falling back to all available details and explicit [] staying empty.
export function contactSearchStages(search: string, namesOnly = false): SearchStage[] {
  return [
    { $lookup: { from: Person.collection.name, let: { personId: { $convert: { input: "$personId", to: "objectId", onError: null, onNull: null } } },
      pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$personId"] } } }, { $project: { name: 1, phoneNumbers: 1, emails: 1 } }], as: "__searchPerson" } },
    { $unwind: "$__searchPerson" },
    { $set: {
      __searchPhones: { $setIntersection: [normalizedContactValues({ $ifNull: ["$selectedPhones", "$__searchPerson.phoneNumbers"] }), normalizedContactValues("$__searchPerson.phoneNumbers")] },
      __searchEmails: { $setIntersection: [normalizedContactValues({ $ifNull: ["$selectedEmails", "$__searchPerson.emails"] }, true), normalizedContactValues("$__searchPerson.emails", true)] },
    } },
    { $match: { $or: buildSearchFieldConditions(namesOnly ? ["__searchPerson.name"] : ["__searchPerson.name", "__searchPhones", "__searchEmails"], search) } },
  ];
}

export async function clientSearchStages(search: string, extraFields: string[] = [], keys?: string[]): Promise<SearchStage[]> {
  if (!search.trim()) return [];
  const customKeys = keys ?? await searchableClientCustomKeys();
  return [
    { $lookup: { from: ClientContact.collection.name, localField: "clientId", foreignField: "clientId",
      pipeline: [...contactSearchStages(search), { $limit: 1 }, { $project: { _id: 1 } }], as: "__searchContact" } },
    { $match: { $or: [
      ...buildSearchFieldConditions([...CLIENT_IDENTITY_FIELDS, ...extraFields, ...customKeys.map(key => `customFields.${key}`)], search),
      { "__searchContact.0": { $exists: true } },
    ] } },
    { $unset: "__searchContact" },
  ];
}

// Apply the caller's authorized/FY/status scope BEFORE these stages. No matching
// client IDs are shipped to a browser or assembled into an unbounded $in list.
export async function recordClientSearchStages(search: string, relationships: string[], moduleFields: string[] = [], options: { clientFields?: string[]; legacyClientName?: string } = {}): Promise<SearchStage[]> {
  if (!search.trim()) return [];
  const clientStages = await clientSearchStages(search, options.clientFields || []);
  const aliases = relationships.map((_, index) => `__matchedClient${index}`);
  const lookups: SearchStage[] = relationships.map((field, index) => ({ $lookup: {
    from: Client.collection.name, localField: field, foreignField: "clientId",
    pipeline: [...clientStages, { $limit: 1 }, { $project: { _id: 1 } }], as: aliases[index],
  } }));
  if (options.legacyClientName) {
    // Preserve quotation contact-name lookup for old rows lacking a clientId.
    // Exact company association avoids leaking matches to similarly named clients.
    const alias = "__legacyMatchedClient";
    aliases.push(alias);
    lookups.push({ $lookup: { from: Client.collection.name, let: { name: `$${options.legacyClientName}`, id: "$clientId" }, pipeline: [
      { $match: { $expr: { $and: [
        { $in: [{ $ifNull: ["$$id", ""] }, ["", null]] },
        { $ne: [{ $ifNull: ["$$name", ""] }, ""] },
        { $eq: [{ $toLower: "$companyName" }, { $toLower: "$$name" }] },
      ] } } }, ...clientStages, { $limit: 1 }, { $project: { _id: 1 } },
    ], as: alias } });
  }
  return [...lookups, { $match: { $or: [
    ...buildSearchFieldConditions(moduleFields, search),
    ...aliases.map(alias => ({ [`${alias}.0`]: { $exists: true } })),
  ] } }, { $unset: aliases }];
}

export function clientSearchProjection(client: Record<string, unknown>, keys: string[], contacts: Array<{ name: string; phoneNumbers: string[]; emails: string[] }>): string[] {
  const custom = (client.customFields || {}) as Record<string, unknown>;
  const strings = (value: unknown): string[] => typeof value === "string" ? [value] : Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  return [...CLIENT_IDENTITY_FIELDS.flatMap(key => strings(client[key])),
    ...keys.flatMap(key => strings(custom[key])),
    ...contacts.flatMap(contact => [contact.name, ...contact.phoneNumbers, ...contact.emails])];
}

export async function trackerEntrySearchStages(search: string, category: string): Promise<SearchStage[]> {
  const stages = await recordClientSearchStages(search, ["clientId"], [], { clientFields: ["category"] });
  if (category) stages.unshift(
    { $lookup: { from: Client.collection.name, localField: "clientId", foreignField: "clientId",
      pipeline: [{ $match: { category } }, { $project: { _id: 1 } }, { $limit: 1 }], as: "__categoryClient" } },
    { $match: { "__categoryClient.0": { $exists: true } } },
    { $unset: "__categoryClient" },
  );
  return stages;
}
