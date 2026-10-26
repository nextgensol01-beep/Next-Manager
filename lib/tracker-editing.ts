import type { TrackerField, TrackerValue } from "@/lib/clientTrackers";

export type TrackerOverviewCount = { key: string; value: TrackerValue; count: number };

export function sameTrackerValue(left: TrackerValue | undefined, right: TrackerValue | undefined) {
  return Array.isArray(left) || Array.isArray(right) ? JSON.stringify(left) === JSON.stringify(right) : left === right;
}

/** Missing/legacy values stay distinct, just as in the server's aggregation. */
export function adjustTrackerOverview(counts: TrackerOverviewCount[] | undefined, field: TrackerField,
  previous: TrackerValue | undefined, next: TrackerValue | undefined) {
  if (!counts || field.dataLink || field.computed || !["status", "select", "toggle"].includes(field.type)
    || sameTrackerValue(previous, next)) return counts;
  const result = counts.map(item => ({ ...item }));
  const old = result.find(item => item.key === field.key && sameTrackerValue(item.value, previous));
  if (old) old.count = Math.max(0, old.count - 1);
  if (next !== undefined) {
    const target = result.find(item => item.key === field.key && sameTrackerValue(item.value, next));
    if (target) target.count++;
    else result.push({ key: field.key, value: next, count: 1 });
  }
  return result;
}
