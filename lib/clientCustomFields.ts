export type ClientCustomFieldType = "text" | "number" | "date" | "checkbox";
export type ClientCustomFieldProfilePosition = "beforeContact" | "afterContact" | "afterCompany";
export type ClientCustomFieldIcon =
  | "fileText"
  | "building"
  | "hash"
  | "user"
  | "mapPin"
  | "phone"
  | "mail"
  | "calendar"
  | "shield";

export type ClientCustomFieldValue = string | boolean;
export type ClientCustomFieldValues = Record<string, ClientCustomFieldValue>;

export type ClientCustomFieldDefinition = {
  _id?: string;
  key: string;
  label: string;
  type: ClientCustomFieldType;
  searchable: boolean;
  required: boolean;
  active: boolean;
  showInProfile?: boolean;
  profilePosition?: ClientCustomFieldProfilePosition;
  icon?: ClientCustomFieldIcon;
  order: number;
  createdAt?: string;
  updatedAt?: string;
};

export const CLIENT_CUSTOM_FIELD_TYPES: Array<{ id: ClientCustomFieldType; label: string }> = [
  { id: "text", label: "Text" },
  { id: "number", label: "Number" },
  { id: "date", label: "Date" },
  { id: "checkbox", label: "Checkbox" },
];

export const CLIENT_CUSTOM_FIELD_PROFILE_POSITIONS: Array<{ id: ClientCustomFieldProfilePosition; label: string }> = [
  { id: "beforeContact", label: "Above Contact Person" },
  { id: "afterContact", label: "Below Contact Details" },
  { id: "afterCompany", label: "Below Company Details" },
];

export const CLIENT_CUSTOM_FIELD_ICONS: Array<{ id: ClientCustomFieldIcon; label: string }> = [
  { id: "fileText", label: "Document" },
  { id: "building", label: "Building" },
  { id: "hash", label: "Number" },
  { id: "user", label: "Person" },
  { id: "mapPin", label: "Location" },
  { id: "phone", label: "Phone" },
  { id: "mail", label: "Email" },
  { id: "calendar", label: "Date" },
  { id: "shield", label: "Credential" },
];

export const isClientCustomFieldType = (value: unknown): value is ClientCustomFieldType =>
  value === "text" || value === "number" || value === "date" || value === "checkbox";

export const isClientCustomFieldProfilePosition = (value: unknown): value is ClientCustomFieldProfilePosition =>
  value === "beforeContact" || value === "afterContact" || value === "afterCompany";

export const isClientCustomFieldIcon = (value: unknown): value is ClientCustomFieldIcon =>
  value === "fileText" ||
  value === "building" ||
  value === "hash" ||
  value === "user" ||
  value === "mapPin" ||
  value === "phone" ||
  value === "mail" ||
  value === "calendar" ||
  value === "shield";

export function customFieldKeyFromLabel(label: string) {
  const words = label
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);

  if (words.length === 0) return "";

  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      return index === 0 ? lower : `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join("");
}

export function normalizeCustomFieldValue(
  definition: Pick<ClientCustomFieldDefinition, "type">,
  value: unknown,
): ClientCustomFieldValue {
  if (definition.type === "checkbox") return Boolean(value);
  if (value === null || typeof value === "undefined") return "";
  return String(value).trim();
}

export function customFieldValueIsEmpty(
  definition: Pick<ClientCustomFieldDefinition, "type">,
  value: unknown,
) {
  if (definition.type === "checkbox") return !Boolean(value);
  return !String(value ?? "").trim();
}
