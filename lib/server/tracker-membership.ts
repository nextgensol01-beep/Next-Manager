import Client from "@/models/Client";
import ClientTrackerEntry from "@/models/ClientTrackerEntry";
import { initialTrackerValues, type ClientTrackerCategory, type TrackerField } from "@/lib/clientTrackers";

/**
 * Keeps rule-based trackers honest when clients are created, recategorised, or removed
 * from a chosen category. Snapshot trackers never call this function.
 */
export async function syncCategoryTrackerMembership(tracker: {
  _id: unknown;
  fields: TrackerField[];
  clientCategories?: ClientTrackerCategory[];
  clientMembershipMode?: "snapshot" | "categorySync";
  clientIds?: string[];
  createdBy?: string;
  save?: () => Promise<unknown>;
}) {
  if (tracker.clientMembershipMode !== "categorySync" || !tracker.clientCategories?.length) return false;
  const clients = await Client.find({ category: { $in: tracker.clientCategories } }).select("clientId").lean();
  const clientIds = clients.map((client) => client.clientId);
  const existing = await ClientTrackerEntry.find({ trackerId: tracker._id }).select("clientId inScope").lean();
  const existingIds = new Set(existing.map((entry) => entry.clientId));
  const additions = clientIds.filter((clientId) => !existingIds.has(clientId));
  if (additions.length) {
    await ClientTrackerEntry.bulkWrite(additions.map((clientId) => ({
      updateOne: {
        filter: { trackerId: tracker._id, clientId },
        update: { $setOnInsert: { values: initialTrackerValues(tracker.fields), updatedBy: tracker.createdBy, inScope: true } },
        upsert: true,
      },
    })));
  }
  await ClientTrackerEntry.updateMany(
    { trackerId: tracker._id, clientId: { $nin: clientIds }, inScope: { $ne: false } },
    { $set: { inScope: false, removedAt: new Date(), removalReason: "No longer matches the tracker category rule" } },
  );
  await ClientTrackerEntry.updateMany(
    { trackerId: tracker._id, clientId: { $in: clientIds }, inScope: false },
    { $set: { inScope: true }, $unset: { removedAt: "", removalReason: "" } },
  );
  const activeExisting = existing.filter((entry) => entry.inScope !== false).length;
  const changed = additions.length > 0 || activeExisting !== clientIds.length;
  if (changed && tracker.save) {
    tracker.clientIds = clientIds;
    await tracker.save();
  }
  return changed;
}
