import DeletedRecord from "@/models/DeletedRecord";
import Client from "@/models/Client";
import ClientContact from "@/models/ClientContact";
import Person from "@/models/Person";
import FinancialYear from "@/models/FinancialYear";
import Billing from "@/models/Billing";
import Payment from "@/models/Payment";
import AnnualReturn from "@/models/AnnualReturn";
import UploadRecord from "@/models/UploadRecord";
import Invoice from "@/models/Invoice";
import AppDocument from "@/models/Document";
import EmailLog from "@/models/EmailLog";
import ClientIdCounter from "@/models/ClientIdCounter";
import {
  normalizeEmailList,
  normalizePhoneList,
  resolveCompanySelections,
  sameStringArray,
} from "@/lib/clientContactSelections";

type MaybeId = { toString(): string } | string;

type PersonRecord = {
  _id: MaybeId;
  name: string;
  phoneNumbers: string[];
  emails: string[];
  createdAt?: unknown;
};

type ClientContactRecord = {
  clientId: string;
  personId: string;
  designation?: string;
  isPrimaryContact?: boolean;
  selectedPhones?: string[];
  selectedEmails?: string[];
  createdAt?: unknown;
};

export type ClientSummary = {
  clientId: string;
  companyName: string;
  category: string;
  state: string;
};

export type ClientPersonInput = {
  personId?: string;
  name?: string;
  phoneNumbers?: string[];
  emails?: string[];
  selectedPhones?: string[];
  selectedEmails?: string[];
  designation?: string;
  isPrimaryContact?: boolean;
};

export type LinkedContact = {
  _id: MaybeId;
  personId: string;
  name: string;
  phoneNumbers: string[];
  emails: string[];
  allPhoneNumbers: string[];
  allEmails: string[];
  selectedPhones: string[];
  selectedEmails: string[];
  mobile: string;
  email: string;
  designation: string;
  isPrimaryContact: boolean;
};

export type ContactDirectoryCompany = ClientSummary & {
  designation: string;
  selectedPhones: string[];
  selectedEmails: string[];
};

export type ContactDirectoryEntry = {
  _id: MaybeId;
  name: string;
  phoneNumbers: string[];
  emails: string[];
  mobile: string;
  email: string;
  createdAt?: unknown;
  companies: ContactDirectoryCompany[];
};

const CLIENT_MUTABLE_FIELDS = [
  "category",
  "companyName",
  "state",
  "address",
  "gstNumber",
  "registrationNumber",
  "cpcbLoginId",
  "cpcbPassword",
  "otpMobileNumber",
] as const;

const CLIENT_ID_PREFIXES: Record<string, string> = {
  PWP: "PWP",
  Producer: "PRD",
  Importer: "IMP",
  "Brand Owner": "BRD",
  SIMP: "SMP",
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toIdString = (value: MaybeId | null | undefined) => (value ? value.toString() : "");
const unique = <T>(values: T[]) => Array.from(new Set(values));
const stripModelMetadata = <T extends Record<string, unknown>>(record: T) => {
  const { _id, __v, ...rest } = record;
  void _id;
  void __v;
  return rest;
};

const buildLinkedContact = (person: PersonRecord, link: ClientContactRecord): LinkedContact => {
  const selections = resolveCompanySelections({
    phones: person.phoneNumbers,
    emails: person.emails,
    selectedPhones: link.selectedPhones,
    selectedEmails: link.selectedEmails,
  });

  return {
    _id: person._id,
    personId: toIdString(person._id),
    name: person.name,
    phoneNumbers: selections.selectedPhones,
    emails: selections.selectedEmails,
    allPhoneNumbers: selections.allPhoneNumbers,
    allEmails: selections.allEmails,
    selectedPhones: selections.selectedPhones,
    selectedEmails: selections.selectedEmails,
    mobile: selections.selectedPhones[0] || "",
    email: selections.selectedEmails[0] || "",
    designation: link.designation || "",
    isPrimaryContact: Boolean(link.isPrimaryContact),
  };
};

const buildContactDirectoryEntry = (person: PersonRecord): ContactDirectoryEntry => ({
  _id: person._id,
  name: person.name,
  phoneNumbers: person.phoneNumbers || [],
  emails: person.emails || [],
  mobile: (person.phoneNumbers || [])[0] || "",
  email: (person.emails || [])[0] || "",
  createdAt: person.createdAt,
  companies: [],
});

const sortLinkedContacts = (contacts: LinkedContact[]) =>
  [...contacts].sort(
    (left, right) => Number(Boolean(right.isPrimaryContact)) - Number(Boolean(left.isPrimaryContact))
  );

const pickClientFields = (body: Record<string, unknown>) => {
  const fields: Record<string, unknown> = {};

  for (const key of CLIENT_MUTABLE_FIELDS) {
    if (!(key in body)) continue;

    if (key === "cpcbPassword") {
      fields[key] = typeof body[key] === "string" ? body[key] : "";
      continue;
    }

    fields[key] = typeof body[key] === "string" ? body[key].trim() : "";
  }

  return fields;
};

export const getClientIdPrefix = (category: string) => CLIENT_ID_PREFIXES[category] || "CLI";

const extractClientSequence = (clientId: string, prefix: string) => {
  const match = clientId.match(new RegExp(`^${escapeRegex(prefix)}-(\\d+)$`));
  if (!match) return 0;
  const seq = parseInt(match[1], 10);
  return Number.isFinite(seq) ? seq : 0;
};

const getMaxExistingClientSequence = async (prefix: string) => {
  const existingClients = await Client.find({ clientId: { $regex: `^${escapeRegex(prefix)}-` } })
    .select("clientId")
    .lean();

  return existingClients.reduce((max, client) => {
    const seq = extractClientSequence(typeof client.clientId === "string" ? client.clientId : "", prefix);
    return seq > max ? seq : max;
  }, 0);
};

export async function allocateNextClientId(category: string) {
  const normalizedCategory = category.trim();
  if (!normalizedCategory) {
    throw new Error("category is required");
  }

  const prefix = getClientIdPrefix(normalizedCategory);
  const maxExistingSequence = await getMaxExistingClientSequence(prefix);

  await ClientIdCounter.findOneAndUpdate(
    { category: normalizedCategory },
    {
      $set: { prefix },
      $setOnInsert: { category: normalizedCategory },
      $max: { seq: maxExistingSequence },
    },
    { upsert: true }
  );

  const counter = await ClientIdCounter.findOneAndUpdate(
    { category: normalizedCategory },
    {
      $set: { prefix },
      $inc: { seq: 1 },
    },
    { new: true }
  );

  return `${prefix}-${String(counter.seq).padStart(3, "0")}`;
}

export async function getLikelyNextClientId(category: string) {
  const normalizedCategory = category.trim();
  if (!normalizedCategory) {
    throw new Error("category is required");
  }

  const prefix = getClientIdPrefix(normalizedCategory);
  const maxExistingSequence = await getMaxExistingClientSequence(prefix);
  const counter = await ClientIdCounter.findOne({ category: normalizedCategory })
    .select("seq")
    .lean() as { seq?: number } | null;
  const nextSequence = Math.max(maxExistingSequence, Number(counter?.seq) || 0) + 1;

  return `${prefix}-${String(nextSequence).padStart(3, "0")}`;
}

export async function ensureClientIdCounterAtLeast(category: string, clientId: string) {
  const normalizedCategory = category.trim();
  if (!normalizedCategory || !clientId.trim()) return;

  const prefix = getClientIdPrefix(normalizedCategory);
  const restoredSequence = extractClientSequence(clientId, prefix);
  if (restoredSequence <= 0) return;

  await ClientIdCounter.findOneAndUpdate(
    { category: normalizedCategory },
    {
      $set: { prefix },
      $setOnInsert: { category: normalizedCategory },
      $max: { seq: restoredSequence },
    },
    { upsert: true }
  );
}

async function resolvePersonRecord(input: ClientPersonInput, index?: number) {
  const name = (input.name || "").trim();
  const phoneNumbers = normalizePhoneList(input.phoneNumbers);
  const emails = normalizeEmailList(input.emails);
  let usedExistingPerson = false;

  if (!name) {
    const label = typeof index === "number" ? `Contact ${index + 1}` : "Contact";
    throw new Error(`${label} is missing a name`);
  }

  if (phoneNumbers.length === 0 && emails.length === 0) {
    throw new Error(`Contact "${name}" needs at least one phone number or email`);
  }

  let personId = input.personId;
  let availablePhones = phoneNumbers;
  let availableEmails = emails;

  if (personId) {
    const existingPerson = await Person.findById(personId);
    if (existingPerson) {
      usedExistingPerson = true;
      existingPerson.name = name || existingPerson.name;
      existingPerson.phoneNumbers = unique([...existingPerson.phoneNumbers, ...phoneNumbers]);
      existingPerson.emails = unique([...existingPerson.emails, ...emails]);
      await existingPerson.save();
      availablePhones = normalizePhoneList(existingPerson.phoneNumbers);
      availableEmails = normalizeEmailList(existingPerson.emails);
    } else {
      personId = undefined;
    }
  }

  if (!personId) {
    let person = null;

    if (phoneNumbers.length > 0 || emails.length > 0) {
      person = await Person.findOne({
        name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
        $or: [
          ...(phoneNumbers.length > 0 ? [{ phoneNumbers: { $in: phoneNumbers } }] : []),
          ...(emails.length > 0 ? [{ emails: { $in: emails } }] : []),
        ],
      });
    }

    if (!person) {
      person = await Person.create({ name, phoneNumbers, emails });
    } else {
      usedExistingPerson = true;
      person.name = name || person.name;
      person.phoneNumbers = unique([...person.phoneNumbers, ...phoneNumbers]);
      person.emails = unique([...person.emails, ...emails]);
      await person.save();
    }

    personId = toIdString(person._id);
    availablePhones = normalizePhoneList(person.phoneNumbers);
    availableEmails = normalizeEmailList(person.emails);
  }

  if (!personId) {
    throw new Error(`Unable to resolve contact "${name}"`);
  }

  const selections = resolveCompanySelections({
    phones: availablePhones,
    emails: availableEmails,
    selectedPhones: input.selectedPhones,
    selectedEmails: input.selectedEmails,
  });

  if (selections.selectedPhones.length === 0 && selections.selectedEmails.length === 0) {
    throw new Error(`Contact "${name}" needs at least one selected phone or email`);
  }

  return {
    personId,
    name,
    availablePhones,
    availableEmails,
    selectedPhones: selections.selectedPhones,
    selectedEmails: selections.selectedEmails,
    usedExistingPerson,
  };
}

export async function getClientContactsMap(clientIds: string[]) {
  const normalizedClientIds = unique(clientIds.filter(Boolean));
  const groupedContacts = new Map<string, LinkedContact[]>();

  if (normalizedClientIds.length === 0) {
    return groupedContacts;
  }

  const links = (await ClientContact.find({ clientId: { $in: normalizedClientIds } }).lean()) as unknown as ClientContactRecord[];
  const personIds = unique(links.map((link) => link.personId).filter(Boolean));
  const persons = personIds.length > 0
    ? ((await Person.find({ _id: { $in: personIds } }).lean()) as unknown as PersonRecord[])
    : [];

  const personMap = new Map(persons.map((person) => [toIdString(person._id), person]));

  for (const link of links) {
    const person = personMap.get(link.personId);
    if (!person) continue;

    const nextContacts = groupedContacts.get(link.clientId) || [];
    nextContacts.push(buildLinkedContact(person, link));
    groupedContacts.set(link.clientId, nextContacts);
  }

  for (const [clientId, contacts] of groupedContacts.entries()) {
    groupedContacts.set(clientId, sortLinkedContacts(contacts));
  }

  return groupedContacts;
}

export async function listCompanyContacts(clientId: string, personId?: string) {
  const clientContactsMap = await getClientContactsMap([clientId]);
  const contacts = clientContactsMap.get(clientId) || [];
  return personId ? contacts.filter((contact) => contact.personId === personId) : contacts;
}

export async function upsertCompanyContactLink(clientId: string, input: ClientPersonInput, index = 0) {
  if (!clientId.trim()) {
    throw new Error("clientId is required");
  }

  const resolvedPerson = await resolvePersonRecord(input, index);
  const existingLink = await ClientContact.findOne({ clientId, personId: resolvedPerson.personId });

  await ClientContact.findOneAndUpdate(
    { clientId, personId: resolvedPerson.personId },
    {
      clientId,
      personId: resolvedPerson.personId,
      designation: input.designation ?? existingLink?.designation ?? "",
      isPrimaryContact: input.isPrimaryContact ?? existingLink?.isPrimaryContact ?? index === 0,
      selectedPhones: resolvedPerson.selectedPhones,
      selectedEmails: resolvedPerson.selectedEmails,
    },
    { upsert: true, new: true }
  );

  const [contact] = await listCompanyContacts(clientId, resolvedPerson.personId);
  return contact || null;
}

export async function syncClientPersons(clientId: string, persons: ClientPersonInput[] = [], removedPersonIds: string[] = []) {
  if (removedPersonIds.length > 0) {
    await ClientContact.deleteMany({ clientId, personId: { $in: removedPersonIds } });
  }

  for (let index = 0; index < persons.length; index += 1) {
    await upsertCompanyContactLink(clientId, persons[index], index);
  }
}

export function listPersons(options: { search?: string | null; limit?: number | null } = {}) {
  const query: Record<string, unknown> = {};
  const search = options.search?.trim();

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { phoneNumbers: { $regex: search, $options: "i" } },
      { emails: { $regex: search, $options: "i" } },
    ];
  }

  let personQuery = Person.find(query).sort({ name: 1 });
  if (typeof options.limit === "number" && Number.isFinite(options.limit) && options.limit > 0) {
    personQuery = personQuery.limit(options.limit);
  }

  return personQuery;
}

export async function createPersonProfile(body: { name?: string; phoneNumbers?: string[]; emails?: string[] }) {
  const resolvedPerson = await resolvePersonRecord(body);
  const person = await Person.findById(resolvedPerson.personId);

  if (!person) {
    throw new Error("Unable to create person");
  }

  return { person, merged: resolvedPerson.usedExistingPerson };
}

export async function updatePersonProfile(
  personId: string,
  body: { name?: string; phoneNumbers?: string[]; emails?: string[] }
) {
  const phoneNumbers = normalizePhoneList(body.phoneNumbers);
  const emails = normalizeEmailList(body.emails);

  const person = await Person.findByIdAndUpdate(
    personId,
    { name: body.name?.trim(), phoneNumbers, emails },
    { new: true }
  );

  if (!person) {
    return null;
  }

  const links = await ClientContact.find({ personId });
  for (const link of links) {
    const selections = resolveCompanySelections({
      phones: phoneNumbers,
      emails,
      selectedPhones: link.selectedPhones,
      selectedEmails: link.selectedEmails,
    });

    if (
      !sameStringArray(link.selectedPhones || [], selections.selectedPhones) ||
      !sameStringArray(link.selectedEmails || [], selections.selectedEmails)
    ) {
      link.selectedPhones = selections.selectedPhones;
      link.selectedEmails = selections.selectedEmails;
      await link.save();
    }
  }

  return person;
}

export async function deletePersonProfile(personId: string) {
  await ClientContact.deleteMany({ personId });
  await Person.findByIdAndDelete(personId);
}

export async function listContactDirectory(options: { search?: string | null; withCompanies?: boolean } = {}) {
  const persons = (await listPersons({ search: options.search, limit: null }).lean()) as unknown as PersonRecord[];
  const entries = persons.map(buildContactDirectoryEntry);

  if (!options.withCompanies || persons.length === 0) {
    return entries;
  }

  const personIds = persons.map((person) => toIdString(person._id));
  const links = (await ClientContact.find({ personId: { $in: personIds } }).lean()) as unknown as ClientContactRecord[];
  const clientIds = unique(links.map((link) => link.clientId).filter(Boolean));
  const clients = clientIds.length > 0
    ? ((await Client.find({ clientId: { $in: clientIds } })
        .select("clientId companyName category state")
        .lean()) as unknown as ClientSummary[])
    : [];

  const clientMap = new Map(clients.map((client) => [client.clientId, client]));
  const linksByPersonId = new Map<string, ClientContactRecord[]>();

  for (const link of links) {
    const nextLinks = linksByPersonId.get(link.personId) || [];
    nextLinks.push(link);
    linksByPersonId.set(link.personId, nextLinks);
  }

  return entries.map((entry) => {
    const personId = toIdString(entry._id);
    const personLinks = linksByPersonId.get(personId) || [];

    return {
      ...entry,
      companies: personLinks
        .map((link) => {
          const client = clientMap.get(link.clientId);
          if (!client) return null;

          const selections = resolveCompanySelections({
            phones: entry.phoneNumbers,
            emails: entry.emails,
            selectedPhones: link.selectedPhones,
            selectedEmails: link.selectedEmails,
          });

          return {
            ...client,
            designation: link.designation || "",
            selectedPhones: selections.selectedPhones,
            selectedEmails: selections.selectedEmails,
          };
        })
        .filter((company): company is ContactDirectoryCompany => Boolean(company)),
    };
  });
}

export async function getContactDirectoryEntry(personId: string) {
  const person = (await Person.findById(personId).lean()) as unknown as PersonRecord | null;
  if (!person) {
    return null;
  }

  const entry = buildContactDirectoryEntry(person);
  const links = (await ClientContact.find({ personId }).lean()) as unknown as ClientContactRecord[];

  if (links.length === 0) {
    return entry;
  }

  const clients = (await Client.find({ clientId: { $in: links.map((link) => link.clientId) } })
    .select("clientId companyName category state")
    .lean()) as unknown as ClientSummary[];

  const clientMap = new Map(clients.map((client) => [client.clientId, client]));

  return {
    ...entry,
    companies: links
      .map((link) => {
        const client = clientMap.get(link.clientId);
        if (!client) return null;

        const selections = resolveCompanySelections({
          phones: entry.phoneNumbers,
          emails: entry.emails,
          selectedPhones: link.selectedPhones,
          selectedEmails: link.selectedEmails,
        });

        return {
          ...client,
          designation: link.designation || "",
          selectedPhones: selections.selectedPhones,
          selectedEmails: selections.selectedEmails,
        };
      })
      .filter((company): company is ContactDirectoryCompany => Boolean(company)),
  };
}

export async function findClientIdsByContactSearch(search: string) {
  const term = search.trim();
  if (!term) return [];

  const persons = (await Person.find({
    $or: [
      { name: { $regex: term, $options: "i" } },
      { phoneNumbers: { $regex: term, $options: "i" } },
      { emails: { $regex: term, $options: "i" } },
    ],
  })
    .select("_id")
    .lean()) as Array<{ _id: MaybeId }>;

  if (persons.length === 0) {
    return [];
  }

  return ClientContact.find({ personId: { $in: persons.map((person) => toIdString(person._id)) } }).distinct("clientId");
}

export async function listClientsWithContacts(options: {
  category?: string | null;
  state?: string | null;
  search?: string | null;
}) {
  const query: Record<string, unknown> = {};

  if (options.category && options.category !== "all") {
    query.category = options.category;
  }

  if (options.state && options.state !== "all") {
    query.state = options.state;
  }

  const search = options.search?.trim();
  if (search) {
    const matchedClientIds = await findClientIdsByContactSearch(search);
    query.$or = [
      { clientId: { $regex: search, $options: "i" } },
      { companyName: { $regex: search, $options: "i" } },
      ...(matchedClientIds.length > 0 ? [{ clientId: { $in: matchedClientIds } }] : []),
    ];
  }

  const clients = await Client.find(query).sort({ createdAt: -1 });
  const contactsMap = await getClientContactsMap(clients.map((client) => client.clientId));

  return clients.map((client) => ({
    ...client.toObject(),
    contacts: contactsMap.get(client.clientId) || [],
  }));
}

export async function listClientSummaries(options: {
  category?: string | null;
  categories?: string[];
  state?: string | null;
  search?: string | null;
  limit?: number;
}) {
  const query: Record<string, unknown> = {};

  if (Array.isArray(options.categories) && options.categories.length > 0) {
    query.category = { $in: options.categories };
  } else if (options.category && options.category !== "all") {
    query.category = options.category;
  }

  if (options.state && options.state !== "all") {
    query.state = options.state;
  }

  const search = options.search?.trim();
  if (search) {
    query.$or = [
      { clientId: { $regex: search, $options: "i" } },
      { companyName: { $regex: search, $options: "i" } },
    ];
  }

  const clientQuery = Client.find(query)
    .select("clientId companyName category state")
    .sort({ companyName: 1 })
    .lean();

  if (typeof options.limit === "number" && Number.isFinite(options.limit) && options.limit > 0) {
    clientQuery.limit(Math.min(Math.floor(options.limit), 250));
  }

  const clients = await clientQuery;

  return clients
    .map((client) => ({
      clientId: typeof client.clientId === "string" ? client.clientId : "",
      companyName: typeof client.companyName === "string" ? client.companyName : "",
      category: typeof client.category === "string" ? client.category : "",
      state: typeof client.state === "string" ? client.state : "",
    }))
    .filter((client) => client.clientId && client.companyName);
}

export async function getClientWithContacts(clientId: string) {
  const client = await Client.findOne({ clientId });
  if (!client) {
    return null;
  }

  const contacts = await listCompanyContacts(clientId);
  return { ...client.toObject(), contacts };
}

export async function createClientRecord(body: Record<string, unknown>) {
  const { persons, removedPersonIds, contactIds, contactId, ...rest } = body;
  void removedPersonIds;
  void contactIds;
  void contactId;

  const clientFields = pickClientFields(rest);
  const clientCategory = typeof clientFields.category === "string" ? clientFields.category : "";
  const companyName = typeof clientFields.companyName === "string" ? clientFields.companyName : "";
  const state = typeof clientFields.state === "string" ? clientFields.state : "";

  if (!clientCategory) {
    throw new Error("category is required");
  }

  if (!companyName) {
    throw new Error("companyName is required");
  }

  if (!state) {
    throw new Error("state is required");
  }

  const { clientId: ignoredClientId, ...clientData } = clientFields;
  void ignoredClientId;

  const nextClientId = await allocateNextClientId(clientCategory);
  const client = await Client.create({ ...clientData, clientId: nextClientId });
  await syncClientPersons(
    client.clientId,
    Array.isArray(persons) ? (persons as ClientPersonInput[]) : [],
    []
  );

  return client;
}

export async function updateClientRecord(clientId: string, body: Record<string, unknown>) {
  const { persons, removedPersonIds, contactIds, contactId, ...rest } = body;
  void contactIds;
  void contactId;

  if (typeof body.clientId === "string" && body.clientId.trim() && body.clientId.trim() !== clientId) {
    throw new Error("clientId cannot be changed");
  }

  const existingClient = await Client.findOne({ clientId }).select("category");
  if (!existingClient) {
    return null;
  }

  if (
    typeof body.category === "string" &&
    body.category.trim() &&
    body.category.trim() !== existingClient.category
  ) {
    throw new Error("category cannot be changed after creation");
  }

  const clientFields = pickClientFields(rest);
  const client = await Client.findOneAndUpdate(
    { clientId },
    { $set: clientFields },
    { new: true, runValidators: true }
  );

  if (!client) {
    return null;
  }

  await syncClientPersons(
    clientId,
    Array.isArray(persons) ? (persons as ClientPersonInput[]) : [],
    Array.isArray(removedPersonIds) ? removedPersonIds.filter((value): value is string => typeof value === "string") : []
  );

  return getClientWithContacts(clientId);
}

export async function deleteClientRecord(clientId: string) {
  const client = await Client.findOne({ clientId });
  if (!client) {
    return null;
  }

  const [
    clientContacts,
    financialYears,
    billings,
    payments,
    annualReturns,
    uploadRecords,
    invoices,
    documents,
    emailLogs,
  ] = await Promise.all([
    ClientContact.find({ clientId }).lean(),
    FinancialYear.find({ clientId }).lean(),
    Billing.find({ clientId }).lean(),
    Payment.find({ clientId }).lean(),
    AnnualReturn.find({ clientId }).lean(),
    UploadRecord.find({ clientId }).lean(),
    Invoice.find({ clientId }).lean(),
    AppDocument.find({ clientId }).lean(),
    EmailLog.find({ clientId }).lean(),
  ]);

  await DeletedRecord.create({
    recordType: "client",
    recordId: client.clientId,
    label: `${client.companyName} (${client.clientId})`,
    subLabel: client.category,
    data: {
      client: client.toObject(),
      clientContacts,
      financialYears,
      billings,
      payments,
      annualReturns,
      uploadRecords,
      invoices,
      documents,
      emailLogs,
    },
  });

  await Promise.all([
    ClientContact.deleteMany({ clientId }),
    FinancialYear.deleteMany({ clientId }),
    Billing.deleteMany({ clientId }),
    Payment.deleteMany({ clientId }),
    AnnualReturn.deleteMany({ clientId }),
    UploadRecord.deleteMany({ clientId }),
    Invoice.deleteMany({ clientId }),
    AppDocument.deleteMany({ clientId }),
    EmailLog.deleteMany({ clientId }),
    Client.findOneAndDelete({ clientId }),
  ]);
  return client;
}

export async function listClientContactEmails(clientId: string) {
  const contacts = await listCompanyContacts(clientId);
  const recipients: Array<{ name: string; email: string }> = [];
  const seenEmails = new Set<string>();

  for (const contact of contacts) {
    for (const email of contact.emails.filter(Boolean)) {
      if (seenEmails.has(email)) continue;
      seenEmails.add(email);
      recipients.push({ name: contact.name, email });
    }
  }

  return recipients;
}

export async function deleteContactDirectoryEntry(personId: string) {
  const person = await Person.findById(personId);
  if (!person) {
    return null;
  }

  await DeletedRecord.create({
    recordType: "contact",
    recordId: personId,
    label: person.name,
    subLabel: person.phoneNumbers[0] || person.emails[0] || "",
    data: {
      name: person.name,
      mobile: person.phoneNumbers[0] || "",
      email: person.emails[0] || "",
      phoneNumbers: person.phoneNumbers,
      emails: person.emails,
      designation: "",
      notes: "",
    },
  });

  await deletePersonProfile(personId);
  return person;
}

export async function restoreLegacyContactRecord(data: Record<string, unknown>) {
  const phoneNumbers = Array.isArray(data.phoneNumbers)
    ? normalizePhoneList(data.phoneNumbers.filter((value): value is string => typeof value === "string"))
    : normalizePhoneList(typeof data.mobile === "string" ? [data.mobile] : []);

  const emails = Array.isArray(data.emails)
    ? normalizeEmailList(data.emails.filter((value): value is string => typeof value === "string"))
    : normalizeEmailList(typeof data.email === "string" ? [data.email] : []);

  const { person } = await createPersonProfile({
    name: typeof data.name === "string" ? data.name : "",
    phoneNumbers,
    emails,
  });

  return person;
}

export type RestorableClientAggregate = {
  client: Record<string, unknown>;
  clientContacts?: Record<string, unknown>[];
  financialYears?: Record<string, unknown>[];
  billings?: Record<string, unknown>[];
  payments?: Record<string, unknown>[];
  annualReturns?: Record<string, unknown>[];
  uploadRecords?: Record<string, unknown>[];
  invoices?: Record<string, unknown>[];
  documents?: Record<string, unknown>[];
  emailLogs?: Record<string, unknown>[];
};

export function isRestorableClientAggregate(data: Record<string, unknown>): data is RestorableClientAggregate {
  return Boolean(data && typeof data === "object" && data.client && typeof data.client === "object");
}

export async function restoreClientAggregate(data: RestorableClientAggregate) {
  const clientData = stripModelMetadata(data.client);
  const nextClientId = typeof clientData.clientId === "string" ? clientData.clientId : "";
  const clientCategory = typeof clientData.category === "string" ? clientData.category : "";

  if (!nextClientId) {
    throw new Error("Restore failed: missing clientId in trash snapshot");
  }

  const existingClient = await Client.findOne({ clientId: nextClientId }).lean();
  if (existingClient) {
    throw new Error(`Restore failed: client ${nextClientId} already exists`);
  }

  await Client.create(clientData);
  await ensureClientIdCounterAtLeast(clientCategory, nextClientId);

  const restoreMany = async (
    Model: { insertMany: (docs: Record<string, unknown>[]) => Promise<unknown> },
    records: Record<string, unknown>[] | undefined
  ) => {
    if (!records || records.length === 0) return;
    await Model.insertMany(records.map(stripModelMetadata));
  };

  await restoreMany(ClientContact, data.clientContacts);
  await restoreMany(FinancialYear, data.financialYears);
  await restoreMany(Billing, data.billings);
  await restoreMany(Payment, data.payments);
  await restoreMany(AnnualReturn, data.annualReturns);
  await restoreMany(UploadRecord, data.uploadRecords);
  await restoreMany(Invoice, data.invoices);
  await restoreMany(AppDocument, data.documents);
  await restoreMany(EmailLog, data.emailLogs);
}
