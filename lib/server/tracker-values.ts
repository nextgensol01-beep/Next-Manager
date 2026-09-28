import type { TrackerField, TrackerValue } from "@/lib/clientTrackers";

/** Validates and normalizes a value before it is stored in a tracker entry. */
export function normalizeTrackerValue(
  field: TrackerField,
  input: unknown,
): { value: TrackerValue } | { error: string } {
  let value: TrackerValue;
  if (field.type === "toggle") value = Boolean(input);
  else if (field.type === "multiSelect" || field.type === "tags") {
    const selected = Array.isArray(input)
      ? input
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
    value = [...new Set(selected)];
    if (
      field.type === "multiSelect" &&
      value.some((item) => !field.options?.includes(item))
    )
      return { error: "Invalid option." };
    if (field.type === "tags" && value.length > 20)
      return { error: "Use up to 20 tags." };
  } else if (
    ["number", "percentage", "quantity", "currency", "progress"].includes(
      field.type,
    )
  ) {
    value =
      input === "" || input === null || typeof input === "undefined"
        ? ""
        : Number(input);
    if (value !== "" && !Number.isFinite(value))
      return { error: "Enter a valid number." };
    if (
      field.type === "percentage" &&
      typeof value === "number" &&
      (value < 0 || value > 100)
    )
      return { error: "Percentage must be between 0 and 100." };
    if (
      field.type === "progress" &&
      typeof value === "number" &&
      (value < 0 || value > 100)
    )
      return { error: "Progress must be between 0 and 100." };
  } else value = String(input ?? "").trim();

  if (field.type === "date" && value && !isCalendarDate(String(value)))
    return { error: "Enter a valid calendar date." };
  if (field.type === "text" && String(value).length > 4000)
    return { error: "Text values are limited to 4,000 characters." };
  if (field.type === "longText" && String(value).length > 10000)
    return { error: "Long text values are limited to 10,000 characters." };
  if (
    (field.type === "status" || field.type === "select") &&
    !field.options?.includes(String(value))
  )
    return { error: "Invalid option." };
  return { value };
}

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
