import { CLIENT_TRACKER_DETAIL_OPTIONS, type ClientTrackerDetailKey, type TrackerField } from "@/lib/clientTrackers";
import { FIELD_TYPES, LIVE_DATA_SOURCES } from "@/lib/tracker-create";
import { normalizeTrackerOptionColors } from "@/lib/tracker-option-colors";

export type TrackerConfiguration = {
  financialYear: string;
  fields: TrackerField[];
  clientColumns: ClientTrackerDetailKey[];
  clientIds: string[];
  /** Opening draft identities distinguish new rows from saved rows with the same key. */
  fieldIdentities?: Record<string, string>;
};
export type TrackerConfigurationChange = {
  id: string; kind: "added" | "removed" | "modified" | "reordered"; label: string;
};
/** UI identity and unfinished option text are never persisted or treated as changes. */
export function configurationFields(fields: TrackerField[]): TrackerField[] {
  return fields.map(field => ({ key: field.key, label: field.label, type: field.type,
    ...(field.options ? { options: [...field.options] } : {}),
    ...(["select", "multiSelect", "tags"].includes(field.type) ? { optionColors: normalizeTrackerOptionColors(field.options, field.optionColors) } : {}),
    ...(field.dataLink ? { dataLink: { ...field.dataLink } } : {}),
    ...(field.computed ? { computed: structuredClone(field.computed) } : {}),
    ...(field.unit ? { unit: field.unit } : {}),
  }));
}
export function configurationSnapshot(tracker: {
  financialYear?: string; fields: TrackerField[]; clientColumns?: ClientTrackerDetailKey[]; clientIds: string[];
}): TrackerConfiguration {
  return { financialYear: tracker.financialYear || "", fields: configurationFields(tracker.fields),
    clientColumns: [...(tracker.clientColumns || ["state"])], clientIds: [...tracker.clientIds],
    fieldIdentities: Object.fromEntries(tracker.fields.filter(field => "uiId" in field).map(field => [(field as TrackerField & { uiId: string }).uiId, field.key])) };
}
export function configurationPreviousField(field: TrackerField, baseline: TrackerConfiguration) {
  const identities = baseline.fieldIdentities;
  const key = identities && Object.keys(identities).length && "uiId" in field ? identities[String(field.uiId)] : field.key;
  return baseline.fields.find(item => item.key === key);
}
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}
export function configurationFieldSignature(field: TrackerField) {
  return stable(configurationFields([field])[0]);
}
export function configurationNeedsFinancialYear(fields: TrackerField[]) {
  return fields.some(field => ["purchaseUploads", "saleUploads", "uploadedData"].includes(field.dataLink?.source || ""));
}
export function configurationFieldState(field: TrackerField, baseline: TrackerConfiguration) {
  const previous = configurationPreviousField(field, baseline);
  return !previous ? "New" : configurationFieldSignature(previous) !== configurationFieldSignature(field) ? "Modified" : undefined;
}
export function configurationChanges(baseline: TrackerConfiguration, draft: TrackerConfiguration): TrackerConfigurationChange[] {
  const changes: TrackerConfigurationChange[] = [];
  const before = new Map(baseline.fields.map(field => [field.key, field]));
  const after = new Map(draft.fields.map(field => [field.key, field]));
  const typeName = (field: TrackerField) => field.type === "status" ? "Status" : FIELD_TYPES.find(type => type.id === field.type)?.label || field.type;
  const sourceName = (field: TrackerField) => field.computed ? "Computed" : field.dataLink ? LIVE_DATA_SOURCES.find(source => source.value === field.dataLink?.source)?.label || "Uploaded data" : "Manual";
  for (const [index, field] of draft.fields.entries()) {
    const previous = configurationPreviousField(field, baseline);
    if (!previous) changes.push({ id: `new-field-${"uiId" in field ? field.uiId : index}`, kind: "added", label: field.label || "Untitled column" });
    else if (configurationFieldSignature(previous) !== configurationFieldSignature(field)) {
      const detail = sourceName(previous) !== sourceName(field) ? `source changed to ${sourceName(field)}`
        : previous.type !== field.type ? `changed from ${typeName(previous)} to ${typeName(field)}`
        : previous.label !== field.label ? `renamed from ${previous.label}` : "modified";
      changes.push({ id: `field-${field.key}`, kind: "modified", label: `${field.label || "Untitled column"} · ${detail}` });
    }
  }
  for (const field of baseline.fields) if (!after.has(field.key)) changes.push({ id: `field-${field.key}`, kind: "removed", label: field.label });
  const beforeOrder = baseline.fields.filter(field => after.has(field.key)).map(field => field.key);
  const afterOrder = draft.fields.filter(field => before.has(field.key)).map(field => field.key);
  if (stable(beforeOrder) !== stable(afterOrder)) changes.push({ id: "field-order", kind: "reordered", label: "Tracker columns reordered" });
  const detailLabel = (key: ClientTrackerDetailKey) => CLIENT_TRACKER_DETAIL_OPTIONS.find(option => option.key === key)?.label || key;
  for (const key of draft.clientColumns) if (!baseline.clientColumns.includes(key)) changes.push({ id: `detail-${key}`, kind: "added", label: detailLabel(key) });
  for (const key of baseline.clientColumns) if (!draft.clientColumns.includes(key)) changes.push({ id: `detail-${key}`, kind: "removed", label: detailLabel(key) });
  if (stable(baseline.clientColumns.filter(key => draft.clientColumns.includes(key))) !== stable(draft.clientColumns.filter(key => baseline.clientColumns.includes(key))))
    changes.push({ id: "detail-order", kind: "reordered", label: "Client details reordered" });
  const oldClients = new Set(baseline.clientIds), newClients = new Set(draft.clientIds);
  const added = draft.clientIds.filter(id => !oldClients.has(id)).length, removed = baseline.clientIds.filter(id => !newClients.has(id)).length;
  if (added) changes.push({ id: "clients-added", kind: "added", label: `${added} client${added === 1 ? "" : "s"} added` });
  if (removed) changes.push({ id: "clients-removed", kind: "removed", label: `${removed} client${removed === 1 ? "" : "s"} removed from the worklist` });
  if (baseline.financialYear !== draft.financialYear) changes.push({ id: "financial-year", kind: "modified", label: `Financial year · ${baseline.financialYear || "No FY"} → ${draft.financialYear || "No FY"}` });
  return changes;
}
/** A changed source/formula/FY needs a fresh server calculation, not invented preview data. */
export function canPreviewSavedValue(before: TrackerField | undefined, after: TrackerField, financialYearChanged: boolean) {
  return Boolean(before && before.type === after.type && stable(before.dataLink) === stable(after.dataLink)
    && stable(before.computed) === stable(after.computed) && !(financialYearChanged && (after.dataLink || after.computed)));
}
