import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Client from "@/models/Client";
import ClientTracker from "@/models/ClientTracker";
import ClientTrackerEntry from "@/models/ClientTrackerEntry";
import { CLIENT_TRACKER_CATEGORIES, CLIENT_TRACKER_DETAIL_OPTIONS, initialTrackerValues, type ClientTrackerCategory, type ClientTrackerDetailKey } from "@/lib/clientTrackers";
import { cleanTrackerFields } from "@/lib/server/tracker-fields";
import { cleanTrackerEmailWorkflows } from "@/lib/server/tracker-email-workflows";
import { isAdminSession } from "@/lib/authUsers";
import { syncCategoryTrackerMembership } from "@/lib/server/tracker-membership";

function usesCpcbUploadData(fields: { dataLink?: { source: string } }[]) {
  return fields.some((field) => ["purchaseUploads", "saleUploads", "uploadedData"].includes(field.dataLink?.source || ""));
}

function cleanClientColumns(value: unknown): ClientTrackerDetailKey[] {
  const allowed = new Set(CLIENT_TRACKER_DETAIL_OPTIONS.map((option) => option.key));
  return Array.isArray(value) ? [...new Set(value.filter((key): key is ClientTrackerDetailKey => typeof key === "string" && allowed.has(key as ClientTrackerDetailKey)))] : ["state"];
}

function cleanClientCategories(value: unknown): ClientTrackerCategory[] {
  const allowed = new Set<string>(CLIENT_TRACKER_CATEGORIES);
  return Array.isArray(value) ? [...new Set(value.filter((category): category is ClientTrackerCategory => typeof category === "string" && allowed.has(category)))] : [];
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const clientId = new URL(req.url).searchParams.get("clientId")?.trim();
  const archiveStatus = new URL(req.url).searchParams.get("status") === "archived" ? "archived" : "active";
  const trackerDocuments = await ClientTracker.find({ status: archiveStatus, ...(clientId ? { clientIds: clientId } : {}) }).sort({ updatedAt: -1 });
  await Promise.all(trackerDocuments.map((tracker) => syncCategoryTrackerMembership(tracker)));
  const trackers = trackerDocuments.map((tracker) => tracker.toObject());
  const trackerIds = trackers.map((tracker) => tracker._id);
  const [counts, clientEntries] = await Promise.all([
    ClientTrackerEntry.aggregate<{ _id: unknown; entryCount: number }>([
      { $match: { trackerId: { $in: trackerIds }, inScope: { $ne: false } } },
      { $group: { _id: "$trackerId", entryCount: { $sum: 1 } } },
    ]),
    clientId ? ClientTrackerEntry.find({ trackerId: { $in: trackerIds }, clientId, inScope: { $ne: false } }).lean() : Promise.resolve([]),
  ]);
  const countsByTracker = new Map(counts.map((count) => [String(count._id), count.entryCount]));
  const entriesByTracker = new Map(clientEntries.map((entry) => [String(entry.trackerId), entry]));
  const payload = trackers.map((tracker) => ({
    ...tracker,
    entryCount: countsByTracker.get(String(tracker._id)) || 0,
    ...(clientId ? { entry: entriesByTracker.get(String(tracker._id)) || null } : {}),
  }));
  return NextResponse.json(payload);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await isAdminSession(session)) return NextResponse.json({ error: "Administrator access required to create trackers." }, { status: 403 });
  try {
    await connectDB();
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const fields = cleanTrackerFields(body.fields, body.includeStatus !== false);
    const financialYear = typeof body.financialYear === "string" ? body.financialYear.trim() : "";
    if (!name) return NextResponse.json({ error: "Tracker name is required." }, { status: 400 });
    if (!fields) return NextResponse.json({ error: "Each field needs a unique name; dropdowns need at least two options." }, { status: 400 });
    if (usesCpcbUploadData(fields) && !financialYear) return NextResponse.json({ error: "Choose a financial year for CPCB upload live data." }, { status: 400 });
    const emailEnabled = body.emailEnabled === true;
    const emailWorkflows = cleanTrackerEmailWorkflows(body.emailWorkflows, fields);
    if (!emailWorkflows) return NextResponse.json({ error: "One or more email workflows are invalid." }, { status: 400 });

    const requestedIds = Array.isArray(body.clientIds)
      ? body.clientIds.filter((id: unknown): id is string => typeof id === "string").map((id: string) => id.trim()).filter(Boolean)
      : [];
    const clientCategories = cleanClientCategories(body.clientCategories);
    const clientMembershipMode = body.scope === "categories" && body.clientMembershipMode === "categorySync" ? "categorySync" : "snapshot";
    if (body.scope === "categories" && !clientCategories.length) return NextResponse.json({ error: "Choose at least one client category." }, { status: 400 });
    const clients = await Client.find(requestedIds.length ? { clientId: { $in: requestedIds } } : clientCategories.length ? { category: { $in: clientCategories } } : {}).select("clientId").lean();
    const clientIds = clients.map((client) => client.clientId);
    if (!clientIds.length) return NextResponse.json({ error: "Select at least one client." }, { status: 400 });

    const tracker = await ClientTracker.create({
      name,
      description: typeof body.description === "string" ? body.description.trim() : "",
      financialYear,
      fields,
      clientColumns: cleanClientColumns(body.clientColumns),
      clientCategories,
      clientMembershipMode,
      clientIds,
      createdBy: session.user?.email || undefined,
      emailEnabled,
      emailWorkflows,
    });
    try {
      await ClientTrackerEntry.insertMany(clientIds.map((clientId) => ({
        trackerId: tracker._id,
        clientId,
        values: initialTrackerValues(fields),
        updatedBy: session.user?.email || undefined,
      })));
    } catch (error) {
      // Mongo installations without replica-set transactions still leave no orphaned tracker.
      await ClientTracker.deleteOne({ _id: tracker._id });
      throw error;
    }
    return NextResponse.json({ ...tracker.toObject(), entryCount: clientIds.length }, { status: 201 });
  } catch (error) {
    console.error("POST /api/client-trackers:", error);
    return NextResponse.json({ error: "Unable to create tracker." }, { status: 500 });
  }
}
