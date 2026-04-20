type MaybeStrings = string[] | undefined | null;

const dedupeStrings = (values: string[]) => Array.from(new Set(values));

export const normalizePhoneList = (values: MaybeStrings) =>
  dedupeStrings((values || []).map((value) => value.trim()).filter(Boolean));

export const normalizeEmailList = (values: MaybeStrings) =>
  dedupeStrings((values || []).map((value) => value.trim().toLowerCase()).filter(Boolean));

export const sanitizeSelectedValues = (
  availableValues: string[],
  selectedValues: MaybeStrings,
  kind: "phone" | "email"
) => {
  const normalize = kind === "email" ? normalizeEmailList : normalizePhoneList;
  const normalizedAvailable = normalize(availableValues);

  if (!Array.isArray(selectedValues)) {
    return normalizedAvailable;
  }

  const availableSet = new Set(normalizedAvailable);
  return normalize(selectedValues).filter((value) => availableSet.has(value));
};

export const sameStringArray = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

export const resolveCompanySelections = ({
  phones,
  emails,
  selectedPhones,
  selectedEmails,
}: {
  phones: MaybeStrings;
  emails: MaybeStrings;
  selectedPhones?: MaybeStrings;
  selectedEmails?: MaybeStrings;
}) => {
  const normalizedPhones = normalizePhoneList(phones);
  const normalizedEmails = normalizeEmailList(emails);

  return {
    allPhoneNumbers: normalizedPhones,
    allEmails: normalizedEmails,
    selectedPhones: sanitizeSelectedValues(normalizedPhones, selectedPhones, "phone"),
    selectedEmails: sanitizeSelectedValues(normalizedEmails, selectedEmails, "email"),
  };
};
