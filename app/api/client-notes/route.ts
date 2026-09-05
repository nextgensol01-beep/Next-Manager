import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import ClientNote from "@/models/ClientNote";
import { recordActivityEvent } from "@/lib/server/activity-events";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const clientId = new URL(req.url).searchParams.get("clientId")?.trim();
  if (!clientId) return NextResponse.json([]);
  return NextResponse.json(await ClientNote.find({ clientId }).sort({ createdAt: -1 }));
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const body = await req.json();
    const clientId = String(body.clientId || "").trim();
    const noteBody = String(body.body || "").trim();
    const financialYear = String(body.financialYear || "").trim() || undefined;
    if (!clientId || !noteBody) return NextResponse.json({ error: "Client and note text are required." }, { status: 400 });
    const note = await ClientNote.create({ clientId, body: noteBody, financialYear, createdBy: session.user?.email || undefined });
    await recordActivityEvent({
      clientId,
      category: "system",
      type: "client_note_added",
      label: "Internal Note Added",
      detail: noteBody.length > 180 ? `${noteBody.slice(0, 177)}...` : noteBody,
      color: "blue",
      badge: "Note",
      financialYear,
      entityId: String(note._id),
      entityType: "note",
      relatedEntityIds: [String(note._id)],
    }, session);
    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error("POST /api/client-notes:", error);
    return NextResponse.json({ error: "Unable to save the note." }, { status: 500 });
  }
}
