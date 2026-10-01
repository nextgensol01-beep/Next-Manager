import type { TrackerEmailWorkflow, TrackerField } from "./clientTrackers";

export type EmailStyleSample = { key: string; label: string; value: string };

/** Column metadata only: preview values never come from a client or a saved rule value. */
export function emailStyleSamples(fields: TrackerField[], workflow: TrackerEmailWorkflow): EmailStyleSample[] {
  const referenced = new Set([
    ...(workflow.conditionGroup?.conditions.map(condition => condition.fieldKey) || []),
    workflow.mainFieldKey,
    ...(workflow.contentRules?.flatMap(rule => rule.conditionGroup.conditions.map(condition => condition.fieldKey)) || []),
    ...workflow.points.map(point => point.fieldKey),
    ...(workflow.attachments?.flatMap(attachment => attachment.conditionGroup?.conditions.map(condition => condition.fieldKey) || []) || []),
  ]);
  const useful = fields.filter(field => field.label.trim() &&
    !/^(?:_?id|client_?id|tracker_?id|workflow_?id|created_?at|updated_?at|deleted_?at)$/i.test(field.key) &&
    !/^(?:id|client id|tracker id|workflow id|created at|updated at)$/i.test(field.label.trim()));
  const priority = (field: TrackerField) => referenced.has(field.key) ? 0 : field.key === "status" ? 2 : 1;
  const seenKeys = new Set<string>();
  const seenLabels = new Set<string>();
  const samples = useful.map((field, index) => ({ field, index }))
    .sort((a, b) => priority(a.field) - priority(b.field) || a.index - b.index)
    .filter(({ field }) => {
      const label = field.label.trim().toLowerCase();
      if (seenKeys.has(field.key) || seenLabels.has(label)) return false;
      seenKeys.add(field.key);
      seenLabels.add(label);
      return true;
    }).slice(0, 3).map(({ field }, index) => ({ key: field.key, label: field.label.trim(), value: sampleValue(field, index) }));
  const fallbacks = [
    { key: "sample-status", label: "Status", value: "Pending" },
    { key: "sample-category", label: "Category", value: "General" },
    { key: "sample-follow-up", label: "Follow-up", value: "12 Oct 2026" },
  ];
  for (const sample of fallbacks) {
    if (samples.length >= (useful.length ? 2 : 3)) break;
    if (!seenLabels.has(sample.label.toLowerCase())) {
      samples.push(sample);
      seenLabels.add(sample.label.toLowerCase());
    }
  }
  return samples;
}

function sampleValue(field: TrackerField, index: number): string {
  const display = field.dataLink?.display;
  if (field.type === "toggle" || display === "yesNo") return index % 2 ? "No" : "Yes";
  if (field.type === "date" || display === "latestDate") return "12 Oct 2026";
  if (field.type === "percentage" || field.type === "progress") return "75%";
  if (["number", "quantity", "currency"].includes(field.type) ||
    display && ["count", "invoiceCount", "quantity", "monthsCovered", "requiredMonths", "missingMonths"].includes(display)) return "12";
  if (["status", "select", "multiSelect", "tags"].includes(field.type)) return index % 2 ? "Completed" : "Pending";
  if (field.type === "text" || field.type === "longText") return "Awaiting data";
  return "Value";
}
