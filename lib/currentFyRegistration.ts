import type { ClientCustomFieldDefinition, ClientCustomFieldValues } from "@/lib/clientCustomFields";

export type FinancialYearRange = {
  financialYear: string;
  startDate: Date;
  endDate: Date;
  startInput: string;
  endInput: string;
};

type ClientLike = {
  customFields?: ClientCustomFieldValues;
};

const CANONICAL_REGISTRATION_DATE_KEYS = [
  "cpcbRegistrationDate",
  "cpcbApprovalDate",
  "registrationDate",
  "approvalDate",
  "portalRegistrationDate",
  "portalApprovalDate",
];

const dateInput = (date: Date) => date.toISOString().slice(0, 10);

export function getCurrentFinancialYear(date = new Date()) {
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

export function getFinancialYearDateRange(financialYear?: string): FinancialYearRange {
  const fy = financialYear && /^\d{4}-\d{2}$/.test(financialYear)
    ? financialYear
    : getCurrentFinancialYear();
  const startYear = Number(fy.slice(0, 4));
  const startDate = new Date(Date.UTC(startYear, 3, 1));
  const endDate = new Date(Date.UTC(startYear + 1, 2, 31, 23, 59, 59, 999));

  return {
    financialYear: fy,
    startDate,
    endDate,
    startInput: dateInput(startDate),
    endInput: dateInput(endDate),
  };
}

export function isLikelyCpcbRegistrationDateField(field: Pick<ClientCustomFieldDefinition, "key" | "label" | "type">) {
  const text = `${field.key} ${field.label}`.toLowerCase();
  const hasDateSignal = field.type === "date" || /date|dt\b/.test(text);
  const isPortalDate = /cpcb|portal|registration|approval|approved|certificate/.test(text);
  const isRegistrationSignal = /registration|approval|approved/.test(text);
  const isExpirySignal = /valid|validity|expiry|expire|renewal/.test(text);

  return hasDateSignal && isPortalDate && isRegistrationSignal && !isExpirySignal;
}

export function getLikelyCpcbRegistrationDateKeys(fields: Pick<ClientCustomFieldDefinition, "key" | "label" | "type">[] = []) {
  return Array.from(new Set([
    ...CANONICAL_REGISTRATION_DATE_KEYS,
    ...fields.filter(isLikelyCpcbRegistrationDateField).map((field) => field.key),
  ].filter(Boolean)));
}

export function parseRegistrationDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function isDateInFinancialYear(value: unknown, financialYear: string) {
  const date = parseRegistrationDate(value);
  if (!date) return false;
  const range = getFinancialYearDateRange(financialYear);
  return date >= range.startDate && date <= range.endDate;
}

export function findCpcbRegistrationDate(
  client: ClientLike,
  fields: Pick<ClientCustomFieldDefinition, "key" | "label" | "type">[] = [],
) {
  const customFields = client.customFields || {};
  const keys = getLikelyCpcbRegistrationDateKeys(fields);

  for (const key of keys) {
    const value = customFields[key];
    const date = parseRegistrationDate(value);
    if (date) {
      return { key, date, value: String(value) };
    }
  }

  return null;
}
