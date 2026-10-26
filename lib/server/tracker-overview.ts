import ClientTrackerEntry from "@/models/ClientTrackerEntry";
import type { TrackerField, TrackerValues } from "@/lib/clientTrackers";
import { resolveTrackerLinkedValues } from "@/lib/server/tracker-linked-data";
import { resolveTrackerComputedValues } from "@/lib/server/tracker-computed-values";
import type { PipelineStage } from "mongoose";

type OverviewTracker = { _id: unknown; fields: TrackerField[]; financialYear?: unknown };
type OverviewCount = { _id: { key: string; value: unknown }; count: number };

/** Fresh whole-tracker totals. Kept separate from the paginated table's critical path. */
async function overviewSnapshot(tracker: OverviewTracker, requestedKeys?: string[], includeTotal = false) {
  const overviewFields = tracker.fields.filter(field => ["status", "select", "toggle"].includes(field.type) && (!requestedKeys || requestedKeys.includes(field.key)));
  const dynamicOverviewFields = overviewFields.filter(field => field.dataLink || field.computed);
  const stages: PipelineStage.FacetPipelineStage[] = [
    { $match: { trackerId: tracker._id, inScope: { $ne: false } } },
    { $project: { values: { $filter: {
      input: { $objectToArray: "$values" }, as: "mark",
      cond: { $in: ["$$mark.k", overviewFields.map(field => field.key)] },
    } } } },
    { $unwind: "$values" },
    { $group: { _id: { key: "$values.k", value: "$values.v" }, count: { $sum: 1 } } },
  ];
  let overviewCounts: OverviewCount[], totalEntryCount: number | undefined;
  if (includeTotal && dynamicOverviewFields.length) overviewCounts = [];
  else if (includeTotal) {
    const [snapshot] = await ClientTrackerEntry.aggregate<{ counts: OverviewCount[]; total: Array<{ value: number }> }>([
      stages[0], { $facet: { counts: stages.slice(1), total: [{ $count: "value" }] } },
    ]);
    overviewCounts = snapshot?.counts || [];
    totalEntryCount = snapshot?.total[0]?.value || 0;
  } else overviewCounts = overviewFields.length ? await ClientTrackerEntry.aggregate<OverviewCount>(stages) : [];
  let resolvedCounts = overviewCounts.map(item => ({ key: item._id.key, value: item._id.value, count: item.count }));
  if (dynamicOverviewFields.length) {
    const entries = await ClientTrackerEntry.find({ trackerId: tracker._id, inScope: { $ne: false } }).select("clientId values").lean();
    const linkedValues = await resolveTrackerLinkedValues(tracker.fields, entries.map(entry => entry.clientId),
      typeof tracker.financialYear === "string" ? tracker.financialYear : undefined);
    const countFields = includeTotal ? overviewFields : dynamicOverviewFields;
    const dynamicKeys = new Set(countFields.map(field => field.key));
    if (includeTotal) totalEntryCount = entries.length;
    const liveCounts = new Map<string, { key: string; value: unknown; count: number }>();
    for (const entry of entries) {
      const values = resolveTrackerComputedValues(tracker.fields, { ...(entry.values as TrackerValues), ...(linkedValues.get(entry.clientId) || {}) });
      for (const field of countFields) {
        if (!field.dataLink && !field.computed && !(field.key in values)) continue;
        const value = values[field.key], countKey = `${field.key}:${typeof value}:${String(value)}`;
        const current = liveCounts.get(countKey) || { key: field.key, value, count: 0 };
        current.count += 1; liveCounts.set(countKey, current);
      }
    }
    resolvedCounts = [...resolvedCounts.filter(item => !dynamicKeys.has(item.key)), ...liveCounts.values()];
  }
  return { overviewCounts: resolvedCounts, totalEntryCount };
}

export async function resolveTrackerOverview(tracker: OverviewTracker, requestedKeys?: string[]) {
  return (await overviewSnapshot(tracker, requestedKeys)).overviewCounts;
}

/** Membership and ordinary field totals share one aggregation input. */
export function resolveTrackerOverviewSnapshot(tracker: OverviewTracker, requestedKeys?: string[]) {
  return overviewSnapshot(tracker, requestedKeys, true);
}
