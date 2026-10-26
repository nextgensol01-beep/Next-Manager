import type { ClientTrackerCategory } from "@/lib/clientTrackers";
export type TrackerClientScope = "all" | "categories" | "selected";
export type TrackerSyncSettings = {
  clientScope?: TrackerClientScope;
  clientCategories?: ClientTrackerCategory[];
  clientMembershipMode?: "snapshot" | "categorySync";
};
// Unknown legacy fixed lists stay selected; never infer an all-clients audience.
export function trackerClientScope(tracker: TrackerSyncSettings): TrackerClientScope {
  return tracker.clientScope || (tracker.clientCategories?.length ? "categories" : "selected");
}
export type TrackerSyncPreview = {
  existingCount: number; missingCount: number; projectedCount: number;
  clients: Array<{ clientId: string; companyName: string; category: string; state?: string }>;
  truncated: boolean; token: string;
};
export type TrackerSyncDraft = Required<TrackerSyncSettings> & {
  syncRequested?: boolean; syncPreviewToken?: string; syncCount?: number;
};
