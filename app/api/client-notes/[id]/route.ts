import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import ClientNote from "@/models/ClientNote";
import { recordActivityEvent } from "@/lib/server/activity-events";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const { id } = await params;
  const note = await ClientNote.findByIdAndDelete(id);
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await recordActivityEvent({
    clientId: note.clientId,
    category: "system",
    type: "client_note_deleted",
    label: "Internal Note Deleted",
    detail: note.body.length > 180 ? `${note.body.slice(0, 177)}...` : note.body,
    color: "rose",
    badge: "Deleted",
    financialYear: note.financialYear,
  }, session);
  return NextResponse.json({ success: true });
}
