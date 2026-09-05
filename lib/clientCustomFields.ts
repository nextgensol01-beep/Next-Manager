export type ClientCustomFieldType = "text" | "number" | "date" | "checkbox" | "password" | "url" | "textarea";
export type ClientCustomFieldProfilePosition = "beforeContact" | "afterContact" | "afterCompany";
export type ClientCustomFieldFormTab = "basic" | "portal";
export type ClientCustomFieldFormSection = "identity" | "company" | "contacts" | "compliance" | "portalCredentials";
export type ClientCustomFieldProfileDisplay = "inline" | "subsection" | "card";
export type ClientCustomFieldProfileCluster = "company" | "contact" | "compliance" | "additional";
export type ClientCustomFieldIcon =
  | "fileText"
  | "building"
  | "hash"
  | "user"
  | "mapPin"
  | "phone"
  | "mail"
  | "calendar"
  | "lock"
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
  showInForm?: boolean;
  showInProfile?: boolean;
  includeInExport?: boolean;
  applicableCategories?: string[];
  groupId?: string;
  formTab?: ClientCustomFieldFormTab;
  formSection?: ClientCustomFieldFormSection;
  profileDisplay?: ClientCustomFieldProfileDisplay;
  profileCluster?: ClientCustomFieldProfileCluster;
  profilePosition?: ClientCustomFieldProfilePosition;
  icon?: ClientCustomFieldIcon;
  order: number;
  createdAt?: string;
  updatedAt?: string;
};

export type ClientCustomFieldGroupDefinition = {
  _id?: string;
  key: string;
  label: string;
  description?: string;
  icon?: ClientCustomFieldIcon;
  showIcon?: boolean;
  active: boolean;
  applicableCategories?: string[];
  formTab: ClientCustomFieldFormTab;
  formSection?: ClientCustomFieldFormSection;
  profileDisplay: Exclude<ClientCustomFieldProfileDisplay, "inline">;
  profileCluster?: ClientCustomFieldProfileCluster;
  order: number;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export const CLIENT_CUSTOM_FIELD_TYPES: Array<{ id: ClientCustomFieldType; label: string }> = [
  { id: "text", label: "Text" },
  { id: "number", label: "Number" },
  { id: "date", label: "Date" },
  { id: "checkbox", label: "Checkbox" },
  { id: "password", label: "Secure Password" },
  { id: "url", label: "URL" },
  { id: "textarea", label: "Multiline Text" },
];

export const CLIENT_CUSTOM_FIELD_FORM_TABS: Array<{ id: ClientCustomFieldFormTab; label: string }> = [
  { id: "basic", label: "Basic Details" },
  { id: "portal", label: "Portal Access" },
];

export const CLIENT_CUSTOM_FIELD_FORM_SECTIONS: Array<{ id: ClientCustomFieldFormSection; label: string; tab: ClientCustomFieldFormTab }> = [
  { id: "identity", label: "Client Identity", tab: "basic" },
  { id: "company", label: "Company", tab: "basic" },
  { id: "contacts", label: "Contacts", tab: "basic" },
  { id: "compliance", label: "Compliance & Location", tab: "basic" },
  { id: "portalCredentials", label: "Portal Credentials", tab: "portal" },
];

export const CLIENT_CUSTOM_FIELD_PROFILE_DISPLAYS: Array<{ id: ClientCustomFieldProfileDisplay; label: string }> = [
  { id: "inline", label: "Inline in Company Overview" },
  { id: "subsection", label: "Company Overview Subsection" },
  { id: "card", label: "Separate Overview Card" },
];

export const CLIENT_CUSTOM_FIELD_PROFILE_CLUSTERS: Array<{ id: ClientCustomFieldProfileCluster; label: string }> = [
  { id: "company", label: "Company Identity" },
  { id: "contact", label: "Primary Contact" },
  { id: "compliance", label: "Compliance & Registration" },
  { id: "additional", label: "Additional Information" },
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
  { id: "lock", label: "Password" },
  { id: "shield", label: "Credential" },
];

export const isClientCustomFieldType = (value: unknown): value is ClientCustomFieldType =>
  value === "text" || value === "number" || value === "date" || value === "checkbox" ||
  value === "password" || value === "url" || value === "textarea";

export const isClientCustomFieldFormTab = (value: unknown): value is ClientCustomFieldFormTab =>
  value === "basic" || value === "portal";

export const isClientCustomFieldFormSection = (value: unknown): value is ClientCustomFieldFormSection =>
  value === "identity" || value === "company" || value === "contacts" || value === "compliance" || value === "portalCredentials";

export const isClientCustomFieldProfileDisplay = (value: unknown): value is ClientCustomFieldProfileDisplay =>
  value === "inline" || value === "subsection" || value === "card";

export const isClientCustomFieldProfileCluster = (value: unknown): value is ClientCustomFieldProfileCluster =>
  value === "company" || value === "contact" || value === "compliance" || value === "additional";

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
  value === "lock" ||
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
