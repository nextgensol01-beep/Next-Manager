import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import DeletedRecord from "@/models/DeletedRecord";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const query = type && type !== "all" ? { recordType: type } : {};
    const records = await DeletedRecord.find(query).sort({ deletedAt: -1 }).limit(200);
    return NextResponse.json(records);
  } catch (error) {
    console.error("GET /api/trash:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
