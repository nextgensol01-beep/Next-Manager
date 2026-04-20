import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import UploadRecord from "@/models/UploadRecord";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");
    const fy = searchParams.get("fy");
    const query: Record<string, string> = {};
    if (clientId) query.clientId = clientId;
    if (fy) query.financialYear = fy;
    const records = await UploadRecord.find(query).sort({ createdAt: -1 });
    return NextResponse.json(records);
  } catch (error) {
    console.error("GET /api/upload-records:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const body = await req.json();
    const record = await UploadRecord.create(body);
    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error("POST /api/upload-records:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
