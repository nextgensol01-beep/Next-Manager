import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import ClientTracker from "@/models/ClientTracker";
import ClientTrackerEntry from "@/models/ClientTrackerEntry";
import type { TrackerField, TrackerValue } from "@/lib/clientTrackers";
import { recordActivityEvent } from "@/lib/server/activity-events";
import { normalizeTrackerValue } from "@/lib/server/tracker-values";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const { id, entryId } = await params;
  const body = await req.json();
  const key = typeof body.key === "string" ? body.key : "";
  const tracker = await ClientTracker.findById(id).lean() as unknown as { fields: TrackerField[]; status: "active" | "archived"; name: string; financialYear?: string } | null;
  if (tracker?.status === "archived") return NextResponse.json({ error: "Restore this tracker before editing marks." }, { status: 409 });
  const field = tracker?.fields.find((item: TrackerField) => item.key === key);
  if (!tracker || !field) return NextResponse.json({ error: "Unknown tracker field." }, { status: 400 });
  if (field.dataLink || field.computed) return NextResponse.json({ error: "This value is live or computed and cannot be edited manually." }, { status: 409 });
  const normalized = normalizeTrackerValue(field, body.value);
  if ("error" in normalized) return NextResponse.json({ error: normalized.error }, { status: 400 });
  const value: TrackerValue = normalized.value;
  const previous = await ClientTrackerEntry.findOne({ _id: entryId, trackerId: id, inScope: { $ne: false } }).select("values").lean();
  const entry = await ClientTrackerEntry.findOneAndUpdate(
    { _id: entryId, trackerId: id, inScope: { $ne: false } },
    { $set: { [`values.${key}`]: value, updatedBy: session.user?.email || undefined } },
    { new: true },
  );
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await recordActivityEvent({
    clientId: entry.clientId,
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
  return NextResponse.json(entry);
}
