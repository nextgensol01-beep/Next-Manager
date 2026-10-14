import ClientTrackerEntry from "@/models/ClientTrackerEntry";
import type { TrackerField, TrackerValues } from "@/lib/clientTrackers";
import { resolveTrackerLinkedValues } from "@/lib/server/tracker-linked-data";
import { resolveTrackerComputedValues } from "@/lib/server/tracker-computed-values";

/** Fresh whole-tracker totals. Kept separate from the paginated table's critical path. */
export async function resolveTrackerOverview(tracker: {
  _id: unknown; fields: TrackerField[]; financialYear?: unknown;
}) {
  const overviewFields = tracker.fields.filter(field => ["status", "select", "toggle"].includes(field.type));
  const overviewCounts = overviewFields.length ? await ClientTrackerEntry.aggregate<{
    _id: { key: string; value: unknown }; count: number;
  }>([
    { $match: { trackerId: tracker._id, inScope: { $ne: false } } },
    { $project: { values: { $filter: {
      input: { $objectToArray: "$values" }, as: "mark",
      cond: { $in: ["$$mark.k", overviewFields.map(field => field.key)] },
    } } } },
    { $unwind: "$values" },
    { $group: { _id: { key: "$values.k", value: "$values.v" }, count: { $sum: 1 } } },
  ]) : [];
  let resolvedCounts = overviewCounts.map(item => ({ key: item._id.key, value: item._id.value, count: item.count }));
  const dynamicOverviewFields = overviewFields.filter(field => field.dataLink || field.computed);
  if (dynamicOverviewFields.length) {
    const entries = await ClientTrackerEntry.find({ trackerId: tracker._id, inScope: { $ne: false } }).select("clientId values").lean();
    const linkedValues = await resolveTrackerLinkedValues(tracker.fields, entries.map(entry => entry.clientId),
      typeof tracker.financialYear === "string" ? tracker.financialYear : undefined);
    const dynamicKeys = new Set(dynamicOverviewFields.map(field => field.key));
    const liveCounts = new Map<string, { key: string; value: unknown; count: number }>();
    for (const entry of entries) {
      const values = resolveTrackerComputedValues(tracker.fields, { ...(entry.values as TrackerValues), ...(linkedValues.get(entry.clientId) || {}) });
      for (const field of dynamicOverviewFields) {
        const value = values[field.key], countKey = `${field.key}:${typeof value}:${String(value)}`;
        const current = liveCounts.get(countKey) || { key: field.key, value, count: 0 };
        current.count += 1; liveCounts.set(countKey, current);
      }
    }
    resolvedCounts = [...resolvedCounts.filter(item => !dynamicKeys.has(item.key)), ...liveCounts.values()];
  }
  return resolvedCounts;
}
