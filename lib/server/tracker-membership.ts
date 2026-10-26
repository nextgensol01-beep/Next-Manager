import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import mongoose from "mongoose";
import Client from "@/models/Client";
import ClientTracker from "@/models/ClientTracker";
import ClientTrackerEntry from "@/models/ClientTrackerEntry";
import { CLIENT_TRACKER_CATEGORIES, initialTrackerValues, type TrackerField } from "@/lib/clientTrackers";
import { trackerClientScope, type TrackerSyncSettings, type TrackerSyncPreview } from "@/lib/tracker-sync";

export type MembershipTracker = TrackerSyncSettings & {
  _id: unknown; fields: TrackerField[]; clientIds?: string[]; createdBy?: string;
  status?: string; updatedAt?: Date; clientSyncCheckedAt?: Date;
};
export class TrackerSyncError extends Error {
  constructor(message: string, public status = 409) { super(message); this.name = "TrackerSyncError"; }
}
export function proposedTrackerAudience(current: MembershipTracker, body: Record<string, unknown>): MembershipTracker {
  const scope = body.clientScope ?? trackerClientScope(current);
  const mode = body.clientMembershipMode ?? current.clientMembershipMode ?? "snapshot";
  const categories = body.clientCategories ?? current.clientCategories ?? [];
  if (!["all", "categories", "selected"].includes(String(scope)) || !["snapshot", "categorySync"].includes(String(mode)) ||
    !Array.isArray(categories) || categories.some(category => !CLIENT_TRACKER_CATEGORIES.includes(category)))
    throw new TrackerSyncError("Choose a valid client audience and synchronization mode.", 400);
  if (scope === "categories" && !categories.length) throw new TrackerSyncError("Choose at least one client category.", 400);
  if (scope === "selected" && mode === "categorySync") throw new TrackerSyncError("Choose All clients or categories before enabling Auto Sync.", 400);
  return { ...current, clientScope: scope as MembershipTracker["clientScope"], clientMembershipMode: mode as MembershipTracker["clientMembershipMode"], clientCategories: [...new Set(categories)] };
}
export function trackerAudienceQuery(tracker: MembershipTracker) {
  const scope = trackerClientScope(tracker);
  if (scope === "categories" && !tracker.clientCategories?.length)
    throw new TrackerSyncError("Choose at least one client category.", 400);
  if (scope === "selected") return { clientId: { $in: tracker.clientIds || [] } };
  return { category: { $in: scope === "all" ? [...CLIENT_TRACKER_CATEGORIES] : tracker.clientCategories! } };
}
function trackerObjectId(id: unknown) {
  return typeof id === "string" && mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : id;
}
function missingPipeline(tracker: MembershipTracker) {
  return [
    { $match: trackerAudienceQuery(tracker) },
    { $lookup: { from: "clienttrackerentries", let: { client: "$clientId" }, pipeline: [
      { $match: { trackerId: trackerObjectId(tracker._id), $expr: { $eq: ["$clientId", "$$client"] } } },
      { $limit: 1 }, { $project: { _id: 1 } },
    ], as: "membership" } },
    // Existing inactive entries remain intentional exclusions/history.
    { $match: { "membership.0": { $exists: false } } },
    { $project: { _id: 0, clientId: 1, companyName: 1, category: 1, state: 1 } },
    { $sort: { clientId: 1 as const } },
  ];
}

/** Insert-only marks; a concurrent sync never overwrites a row or an exclusion. */
export async function addTrackerClients(tracker: MembershipTracker, clientIds: string[]) {
  if (!clientIds.length) return 0;
  const clients = await Client.find({ $and: [trackerAudienceQuery(tracker), { clientId: { $in: clientIds } }] }).select("clientId").lean();
  const ids = clients.map(client => client.clientId as string);
  if (!ids.length) return 0;
  const now = new Date();
  const operations = ids.map(clientId => ({ updateOne: {
    filter: { trackerId: tracker._id, clientId },
    update: { $setOnInsert: { values: initialTrackerValues(tracker.fields), inScope: true, updatedBy: tracker.createdBy, createdAt: now, updatedAt: now } },
    upsert: true, timestamps: false,
  } }));
  let added = 0;
  try {
    const result = await ClientTrackerEntry.bulkWrite(operations, { ordered: false, timestamps: false });
    added = result.upsertedCount;
  } catch (error) {
    const failure = error as { writeErrors?: Array<{ code: number }>; result?: { upsertedCount?: number } };
    if (!failure.writeErrors?.length || failure.writeErrors.some(item => item.code !== 11000)) throw error;
    added = failure.result?.upsertedCount || 0;
  }
  const active = await ClientTrackerEntry.find({ trackerId: tracker._id, clientId: { $in: ids }, inScope: { $ne: false } }).select("clientId").lean();
  const activeIds = active.map(entry => entry.clientId as string);
  if (activeIds.length) {
    await ClientTracker.updateOne({ _id: tracker._id }, { $addToSet: { clientIds: { $each: activeIds } } }, { timestamps: false });
    tracker.clientIds = [...new Set([...(tracker.clientIds || []), ...activeIds])];
  }
  return added;
}

/** Repair the insert→metadata crash gap without changing any entry or its values. */
async function repairMembershipIds(tracker: MembershipTracker) {
  const rows = await ClientTrackerEntry.find({ trackerId: tracker._id, inScope: { $ne: false },
    clientId: { $nin: tracker.clientIds || [] },
  }).select("clientId").limit(200).lean();
  const ids = rows.map(row => row.clientId as string);
  if (ids.length) {
    await ClientTracker.updateOne({ _id: tracker._id }, { $addToSet: { clientIds: { $each: ids } } }, { timestamps: false });
    tracker.clientIds = [...new Set([...(tracker.clientIds || []), ...ids])];
  }
  return ids.length;
}

/** Bounded catch-up on open/export, with a database throttle across instances. */
export async function syncCategoryTrackerMembership(tracker: MembershipTracker) {
  if (tracker.clientMembershipMode !== "categorySync" || trackerClientScope(tracker) === "selected" || tracker.status === "archived") return false;
  // The tracker was just read from MongoDB. Respect the same database-backed
  // reconciliation lease without issuing another no-op update on every open.
  // An expired/missing lease still takes the atomic reservation below; client
  // write-path sync and the bounded crash-recovery fallback remain unchanged.
  const checkedAt = tracker.clientSyncCheckedAt ? new Date(tracker.clientSyncCheckedAt).getTime() : 0;
  if (checkedAt > Date.now() - 60_000 && checkedAt <= Date.now()) return false;
  const reserved = await ClientTracker.updateOne({ _id: tracker._id, clientMembershipMode: "categorySync",
    $or: [{ clientSyncCheckedAt: null }, { clientSyncCheckedAt: { $lte: new Date(Date.now() - 60_000) } }],
  }, { $set: { clientSyncCheckedAt: new Date() } }, { timestamps: false });
  if (!reserved.modifiedCount) return false;
  try {
    const repaired = await repairMembershipIds(tracker);
    const missing = await Client.aggregate([...missingPipeline(tracker), { $limit: 200 }]);
    const added = await addTrackerClients(tracker, missing.map(client => client.clientId));
    if (missing.length === 200 || repaired === 200) await ClientTracker.updateOne({ _id: tracker._id }, { $unset: { clientSyncCheckedAt: 1 } }, { timestamps: false });
    return added > 0 || repaired > 0;
  } catch (error) {
    await ClientTracker.updateOne({ _id: tracker._id }, { $unset: { clientSyncCheckedAt: 1 } }, { timestamps: false });
    throw error;
  }
}

/** Runs inside the existing client transaction; no in-memory events or queue. */
export async function syncClientIntoAutoTrackers(client: { clientId: string; category: string }) {
  const trackers = await ClientTracker.find({ status: "active", clientMembershipMode: "categorySync", $or: [
    { clientScope: "all" }, { clientScope: "categories", clientCategories: client.category },
    { clientScope: null, clientCategories: client.category },
  ] }).select("fields clientScope clientCategories clientMembershipMode createdBy").lean<MembershipTracker[]>();
  for (const tracker of trackers) await addTrackerClients(tracker, [client.clientId]);
}

function policy(tracker: MembershipTracker) {
  return JSON.stringify({ id: String(tracker._id), scope: trackerClientScope(tracker), categories: [...(tracker.clientCategories || [])].sort() });
}
function signingKey() {
  if (!process.env.NEXTAUTH_SECRET) throw new TrackerSyncError("Sync preview requires the server authentication secret.", 503);
  return process.env.NEXTAUTH_SECRET;
}
async function candidates(tracker: MembershipTracker) {
  const clients: TrackerSyncPreview["clients"] = [], ids: string[] = [];
  const hash = createHash("sha256");
  const cursor = Client.aggregate(missingPipeline(tracker)).cursor({ batchSize: 200 });
  try {
    for await (const client of cursor) {
      ids.push(client.clientId);
      hash.update(JSON.stringify(client.clientId) + "\n");
      if (clients.length < 250) clients.push(client);
      if (ids.length > 20_000) throw new TrackerSyncError("This sync exceeds 20,000 missing clients. Narrow the audience before syncing.", 400);
    }
  } finally { await cursor.close(); }
  return { clients, ids, fingerprint: hash.digest("hex") };
}
export async function previewTrackerSync(tracker: MembershipTracker, owner: string): Promise<TrackerSyncPreview> {
  const [pending, existingCount] = await Promise.all([
    candidates(tracker), ClientTrackerEntry.countDocuments({ trackerId: tracker._id, inScope: { $ne: false } }),
  ]);
  const payload = Buffer.from(JSON.stringify({ policy: policy(tracker), owner, fingerprint: pending.fingerprint, expires: Date.now() + 10 * 60_000 })).toString("base64url");
  const token = payload + "." + createHmac("sha256", signingKey()).update("tracker-sync:v1:" + payload).digest("base64url");
  return { existingCount, missingCount: pending.ids.length, projectedCount: existingCount + pending.ids.length, clients: pending.clients, truncated: pending.ids.length > pending.clients.length, token };
}
export async function confirmTrackerSync(tracker: MembershipTracker, owner: string, token: unknown) {
  if (typeof token !== "string" || token.length > 8000) throw new TrackerSyncError("Preview eligible clients before syncing.");
  const [payload, signature, extra] = token.split(".");
  const expected = createHmac("sha256", signingKey()).update("tracker-sync:v1:" + payload).digest();
  const actual = Buffer.from(signature || "", "base64url");
  if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new TrackerSyncError("Sync preview changed. Preview again.");
  let proof: { policy: string; owner: string; fingerprint: string; expires: number };
  try { proof = JSON.parse(Buffer.from(payload, "base64url").toString()); } catch { throw new TrackerSyncError("Preview eligible clients again."); }
  if (proof.owner !== owner || proof.policy !== policy(tracker) || proof.expires < Date.now()) throw new TrackerSyncError("This sync preview expired or its audience changed. Preview again.");
  const pending = await candidates(tracker);
  if (proof.fingerprint !== pending.fingerprint) throw new TrackerSyncError("Eligible clients changed since preview. Preview again before saving.");
  return pending.ids;
}
export async function applyTrackerSync(tracker: MembershipTracker, ids: string[]) {
  let added = 0;
  const deadline = Date.now() + 15_000;
  // Normally one pass; paged repair also handles older partially written imports.
  while (await repairMembershipIds(tracker) === 200) {
    if (Date.now() > deadline) throw new TrackerSyncError("Sync recovery is still pending. Preview again to continue.", 503);
  }
  for (let start = 0; start < ids.length; start += 200) {
    if (Date.now() > deadline) throw new TrackerSyncError("Sync was interrupted after adding some clients. Existing marks are intact. Preview again to finish remaining clients.", 503);
    added += await addTrackerClients(tracker, ids.slice(start, start + 200));
  }
  return added;
}
