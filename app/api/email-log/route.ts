import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import EmailLog from "@/models/EmailLog";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  const type = searchParams.get("type");
  const query: Record<string, unknown> = {};
  if (clientId) query.clientId = clientId;
  if (type && type !== "all") query.type = type;
  const logs = await EmailLog.find(query).sort({ sentAt: -1 }).limit(200);
  return NextResponse.json(logs);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const body = await req.json();
  const log = await EmailLog.create(body);
  return NextResponse.json(log, { status: 201 });
}

// DELETE ?ids=id1,id2,id3  OR  ?all=true  OR  ?type=payment_reminder
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const { searchParams } = new URL(req.url);
  const ids  = searchParams.get("ids");
  const all  = searchParams.get("all");
  const type = searchParams.get("type");

  if (all === "true") {
    const query: Record<string, unknown> = {};
    if (type && type !== "all") query.type = type;
    const result = await EmailLog.deleteMany(query);
    return NextResponse.json({ deleted: result.deletedCount });
  }
  if (ids) {
    const idList = ids.split(",").filter(Boolean);
    const result = await EmailLog.deleteMany({ _id: { $in: idList } });
    return NextResponse.json({ deleted: result.deletedCount });
  }
  return NextResponse.json({ error: "Provide ids or all=true" }, { status: 400 });
}
