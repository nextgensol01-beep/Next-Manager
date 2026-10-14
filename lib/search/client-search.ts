// Browser-safe matching shared with the MongoDB search builders. Keep values
// separate: a query must not bridge two unrelated contact/custom-field values.
export const CLIENT_IDENTITY_FIELDS = ["clientId", "companyName", "legalName"];
export const MAX_SEARCH_LENGTH = 200;
export const escapeSearchRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function flexibleSearchPattern(value: string) {
  const normalized = value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 80);
  return normalized.split("").map(escapeSearchRegex).join("[^a-z0-9]*");
}

export function createSearchMatcher(query: string) {
  const term = query.trim();
  const literal = new RegExp(escapeSearchRegex(term), "i");
  const pattern = flexibleSearchPattern(term);
  const flexible = pattern ? new RegExp(pattern, "i") : null;
  return (value: unknown): boolean => {
    if (!term) return true;
    if (Array.isArray(value)) return value.some(item => typeof item === "string" && (literal.test(item) || Boolean(flexible?.test(item))));
    // MongoDB string regex does not stringify numbers, booleans or objects.
    return typeof value === "string" && (literal.test(value) || Boolean(flexible?.test(value)));
  };
}

export type ClientSearchSource = {
  clientId?: string;
  companyName?: string;
  legalName?: string;
  searchValues?: string[];
  contacts?: Array<{ name?: string; phoneNumbers?: string[]; emails?: string[]; selectedPhones?: string[]; selectedEmails?: string[] }>;
};

export function clientSearchValues(client: ClientSearchSource): string[] {
  // Supplied by the server from active, searchable, noncredential definitions
  // and this company's selected contacts; never inspect arbitrary customFields.
  if (Array.isArray(client.searchValues)) return client.searchValues;
  return [client.clientId || "", client.companyName || "", client.legalName || "",
    ...(client.contacts || []).flatMap(contact => [contact.name || "",
      ...(contact.selectedPhones ?? contact.phoneNumbers ?? []),
      ...(contact.selectedEmails ?? contact.emails ?? [])])];
}

export function matchesClientSearch(client: ClientSearchSource | null | undefined, query: string): boolean {
  return Boolean(client && clientSearchValues(client).some(createSearchMatcher(query)));
}

export function createClientSearchIndex(clients: ClientSearchSource[]) {
  const values = new Map(clients.map(client => [client.clientId, clientSearchValues(client)]));
  return (query: string) => {
    const matches = createSearchMatcher(query);
    const ids = new Set<string>();
    for (const [id, fields] of values) if (id && fields.some(matches)) ids.add(id);
    return ids;
  };
}
