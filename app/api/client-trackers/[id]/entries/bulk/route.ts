import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import ClientTracker from "@/models/ClientTracker";
import ClientTrackerEntry from "@/models/ClientTrackerEntry";
import type { TrackerField, TrackerValue } from "@/lib/clientTrackers";
import { recordActivityEvent } from "@/lib/server/activity-events";
import { normalizeTrackerValue } from "@/lib/server/tracker-values";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const { id } = await params;
  const body = await req.json();
  const entryIds = Array.isArray(body.entryIds) ? body.entryIds.filter((entryId: unknown): entryId is string => typeof entryId === "string") : [];
  const key = typeof body.key === "string" ? body.key : "";
  if (!entryIds.length || entryIds.length > 1000) return NextResponse.json({ error: "Choose between 1 and 1,000 clients." }, { status: 400 });
  const tracker = await ClientTracker.findById(id).lean() as unknown as { fields: TrackerField[]; status: "active" | "archived"; name: string; financialYear?: string } | null;
  if (!tracker) return NextResponse.json({ error: "Tracker not found." }, { status: 404 });
  if (tracker?.status === "archived") return NextResponse.json({ error: "Restore this tracker before editing marks." }, { status: 409 });
  const field = tracker?.fields.find((item: TrackerField) => item.key === key);
  if (!field) return NextResponse.json({ error: "Unknown tracker field." }, { status: 400 });
  if (field.dataLink || field.computed) return NextResponse.json({ error: "Live and computed columns cannot be bulk edited." }, { status: 409 });
  const normalized = normalizeTrackerValue(field, body.value);
  if ("error" in normalized) return NextResponse.json({ error: normalized.error }, { status: 400 });
  const value: TrackerValue = normalized.value;
  const previous = await ClientTrackerEntry.find({ _id: { $in: entryIds }, trackerId: id, inScope: { $ne: false } }).select("_id clientId values").lean();
  const result = await ClientTrackerEntry.updateMany(
    { _id: { $in: entryIds }, trackerId: id, inScope: { $ne: false } },
    { $set: { [`values.${key}`]: value, updatedBy: session.user?.email || undefined } },
  );
  await Promise.all(previous.map((entry) => recordActivityEvent({
    clientId: entry.clientId,
    category: "system",
    type: "tracker_bulk_mark_updated",
    label: `${tracker.name || "Tracker"} · ${field.label} bulk updated`,
    detail: `${field.label}: ${String((entry.values as Record<string, TrackerValue>)[key] ?? "—")} → ${String(value ?? "—")} (bulk update)`,
    color: "blue",
    badge: field.label,
    financialYear: tracker.financialYear,
    entityId: id,
    entityType: "client_tracker",
  }, session)));
  return NextResponse.json({
    updated: result.modifiedCount,
    previous: previous.map((entry) => ({ id: String(entry._id), value: (entry.values as Record<string, TrackerValue>)[key] })),
  });
}
