import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import ClientWorkItem, { type ClientWorkItemKind } from "@/models/ClientWorkItem";
import { recordActivityEvent } from "@/lib/server/activity-events";

const KINDS = new Set<ClientWorkItemKind>(["task", "reminder", "follow_up", "call", "meeting"]);

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const clientId = new URL(req.url).searchParams.get("clientId")?.trim();
  if (!clientId) return NextResponse.json([]);
  return NextResponse.json(await ClientWorkItem.find({ clientId }).sort({ status: 1, dueAt: 1, createdAt: -1 }));
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const body = await req.json();
    const clientId = String(body.clientId || "").trim();
    const title = String(body.title || "").trim();
    const kind = String(body.kind || "task") as ClientWorkItemKind;
    if (!clientId || !title || !KINDS.has(kind)) return NextResponse.json({ error: "Client, type and title are required." }, { status: 400 });
    const workItem = await ClientWorkItem.create({
      clientId,
      kind,
      title,
      details: String(body.details || "").trim(),
      financialYear: String(body.financialYear || "").trim() || undefined,
      priority: body.priority === "low" || body.priority === "high" ? body.priority : "normal",
      ownerEmail: String(body.ownerEmail || session.user?.email || "").trim() || undefined,
      dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
      createdBy: session.user?.email || undefined,
    });
    await recordActivityEvent({
      clientId,
      category: kind === "call" || kind === "meeting" || kind === "follow_up" ? "communications" : "system",
      type: `${kind}_created`,
      label: `${kind.replace("_", " ").replace(/^./, (letter) => letter.toUpperCase())} Added`,
      detail: title,
      color: kind === "reminder" ? "amber" : "blue",
      badge: workItem.priority === "high" ? "High priority" : "Open",
      financialYear: workItem.financialYear,
      entityId: String(workItem._id),
      entityType: "work-item",
      relatedEntityIds: [String(workItem._id)],
    }, session);
    return NextResponse.json(workItem, { status: 201 });
  } catch (error) {
    console.error("POST /api/client-work-items:", error);
    return NextResponse.json({ error: "Unable to save this item." }, { status: 500 });
  }
}
