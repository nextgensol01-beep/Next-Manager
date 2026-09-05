import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import ClientWorkItem from "@/models/ClientWorkItem";
import { recordActivityEvent } from "@/lib/server/activity-events";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const { id } = await params;
  const body = await req.json();
  const update: Record<string, unknown> = {};
  if (["open", "completed", "cancelled"].includes(body.status)) {
    update.status = body.status;
    update.completedAt = body.status === "completed" ? new Date() : null;
  }
  const item = await ClientWorkItem.findByIdAndUpdate(id, { $set: update }, { new: true });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await recordActivityEvent({
    clientId: item.clientId,
    category: item.kind === "call" || item.kind === "meeting" || item.kind === "follow_up" ? "communications" : "system",
    type: `${item.kind}_${item.status}`,
    label: `${item.title} · ${item.status === "completed" ? "Completed" : item.status === "cancelled" ? "Cancelled" : "Reopened"}`,
    detail: item.details || item.title,
    color: item.status === "completed" ? "emerald" : item.status === "cancelled" ? "rose" : "blue",
    badge: item.status,
    financialYear: item.financialYear,
    entityId: String(item._id),
    entityType: "work-item",
    relatedEntityIds: [String(item._id)],
  }, session);
  return NextResponse.json(item);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const { id } = await params;
  const item = await ClientWorkItem.findByIdAndDelete(id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await recordActivityEvent({
    clientId: item.clientId,
    category: "system",
    type: `${item.kind}_deleted`,
    label: `${item.title} · Deleted`,
    detail: item.details || item.title,
    color: "rose",
    badge: "Deleted",
    financialYear: item.financialYear,
  }, session);
  return NextResponse.json({ success: true });
}
