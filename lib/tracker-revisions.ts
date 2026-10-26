/** Legacy marks have revision zero; revisions belong to fields, never whole rows. */
export function trackerMarkRevision(revisions: Record<string, number> | undefined, key: string) {
  return revisions?.[key] ?? 0;
}
export function isTrackerMarkRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER;
}
export function trackerMarkRevisionQuery(key: string, expected: number) {
  const path = `fieldRevisions.${key}`;
  return expected === 0 ? { $or: [{ [path]: 0 }, { [path]: { $exists: false } }] } : { [path]: expected };
}
