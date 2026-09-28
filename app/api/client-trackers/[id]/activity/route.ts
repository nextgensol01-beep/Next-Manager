import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import ActivityEvent from "@/models/ActivityEvent";

/** A compact tracker-specific audit feed; client profile history remains unchanged. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const { id } = await params;
  const events = await ActivityEvent.find({ entityType: "client_tracker", entityId: id })
    .sort({ occurredAt: -1 })
    .limit(100)
    .select("clientId label detail badge actorEmail occurredAt type")
    .lean();
  return NextResponse.json({ events });
}
