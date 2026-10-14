import type { TrackerField, TrackerValue } from "@/lib/clientTrackers";

const numericTypes = new Set(["number", "percentage", "quantity", "currency", "progress"]);
export const TRACKER_ALL_FILTER = "__all_tracker_values__";

export function trackerFilterValue(field: TrackerField, value: string): string | number | boolean {
  if (field.type === "toggle") {
    if (["yes", "true"].includes(value.toLowerCase())) return true;
    if (["no", "false"].includes(value.toLowerCase())) return false;
  }
  if (numericTypes.has(field.type) && value.trim() && Number.isFinite(Number(value)))
    return Number(value);
  return value;
}

/** Use the same value semantics for stored marks, live values, and exports. */
export function matchesTrackerFieldFilter(field: TrackerField, raw: TrackerValue | undefined, value: string): boolean {
  if (field.type === "multiSelect" || field.type === "tags")
    return Array.isArray(raw) && raw.includes(value);
  if (field.type === "text" || field.type === "longText")
    return String(raw ?? "").toLowerCase().includes(value.toLowerCase());
  const wanted = trackerFilterValue(field, value);
  if (typeof wanted === "number")
    return raw !== "" && raw != null && Number(raw) === wanted;
  return raw === wanted;
}

export function trackerFieldFilterQuery(field: TrackerField, value: string): unknown {
  if (field.type === "text" || field.type === "longText")
    return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  if (field.type === "multiSelect" || field.type === "tags") return { $in: [value] };
  return trackerFilterValue(field, value);
}
