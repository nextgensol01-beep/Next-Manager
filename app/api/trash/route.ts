import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import DeletedRecord from "@/models/DeletedRecord";
import { clientCredentialAccess } from "@/lib/server/client-credentials";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const query = type && type !== "all" ? { recordType: type } : {};
    if (searchParams.get("count") === "1") {
      const count = await DeletedRecord.countDocuments(query);
      return NextResponse.json({ count });
    }
    const records = await DeletedRecord.find(query).sort({ deletedAt: -1 }).limit(200).lean();
    const access = await clientCredentialAccess(session);
    return NextResponse.json(records.map((record) => {
      if (record.recordType !== "client" || !record.data?.client) return record;
      return { ...record, data: { ...record.data, client: access.read(record.data.client) } };
    }));
  } catch (error) {
    console.error("GET /api/trash:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
