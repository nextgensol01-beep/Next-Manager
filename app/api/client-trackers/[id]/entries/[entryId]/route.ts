import { withTrackerApiErrors, readTrackerRequestBody } from "@/lib/server/tracker-api-errors";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import ClientTracker from "@/models/ClientTracker";
import ClientTrackerEntry from "@/models/ClientTrackerEntry";
import type { TrackerField, TrackerValue } from "@/lib/clientTrackers";
import { recordActivityEvent } from "@/lib/server/activity-events";
import { normalizeTrackerValue } from "@/lib/server/tracker-values";
import { isTrackerMarkRevision, trackerMarkRevisionQuery, trackerMarkRevision } from "@/lib/tracker-revisions";

export const PATCH = withTrackerApiErrors(async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const { id, entryId } = await params;
  const body = await readTrackerRequestBody(req);
  const key = typeof body.key === "string" ? body.key : "";
  const tracker = await ClientTracker.findById(id).select("fields status name financialYear").lean() as unknown as { fields: TrackerField[]; status: "active" | "archived"; name: string; financialYear?: string } | null;
  if (tracker?.status === "archived") return NextResponse.json({ error: "Restore this tracker before editing marks." }, { status: 409 });
  const field = tracker?.fields.find((item: TrackerField) => item.key === key);
  if (!tracker || !field) return NextResponse.json({ error: "Unknown tracker field." }, { status: 400 });
  if (field.dataLink || field.computed) return NextResponse.json({ error: "This value is live or computed and cannot be edited manually." }, { status: 409 });
  const normalized = normalizeTrackerValue(field, body.value);
  if ("error" in normalized) return NextResponse.json({ error: normalized.error }, { status: 400 });
  const value: TrackerValue = normalized.value;
  if (!isTrackerMarkRevision(body.expectedRevision)) return NextResponse.json({ error: "Refresh this mark before saving; its revision is required." }, { status: 400 });
  const expectedRevision = body.expectedRevision;
  const updatedAt = new Date();
  // The atomic pre-image is also the audit's previous value, even with another editor.
  const previous = await ClientTrackerEntry.findOneAndUpdate(
    { _id: entryId, trackerId: id, inScope: { $ne: false }, ...trackerMarkRevisionQuery(key, expectedRevision) },
    { $set: { [`values.${key}`]: value, updatedAt, updatedBy: session.user?.email || undefined }, $inc: { [`fieldRevisions.${key}`]: 1 } },
    { new: false },
  ).select(`clientId values.${key}`).lean() as unknown as { clientId: string; values: Record<string, TrackerValue> } | null;
  if (!previous) {
    const current = await ClientTrackerEntry.findOne({ _id: entryId, trackerId: id, inScope: { $ne: false } })
      .select(`values.${key} fieldRevisions.${key} updatedAt`).lean() as unknown as { values: Record<string, TrackerValue>; fieldRevisions?: Record<string, number>; updatedAt: Date } | null;
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ code: "MARK_CONFLICT", error: "This field changed elsewhere. The saved value has been restored; review it before editing again.",
      current: { value: current.values[key], revision: trackerMarkRevision(current.fieldRevisions, key), updatedAt: current.updatedAt } }, { status: 409 });
  }
  await recordActivityEvent({
    clientId: previous.clientId,
    category: "system",
    type: "tracker_mark_updated",
    label: `${tracker.name} · ${field.label} updated`,
    detail: `${field.label}: ${String((previous?.values as Record<string, TrackerValue> | undefined)?.[key] ?? "—")} → ${String(value ?? "—")}`,
    color: "blue",
    badge: field.label,
    financialYear: tracker.financialYear,
    entityId: id,
    entityType: "client_tracker",
  }, session);
  return NextResponse.json({ _id: entryId, values: { [key]: value }, fieldRevisions: { [key]: expectedRevision + 1 }, previousValue: previous.values[key], updatedAt });
});
