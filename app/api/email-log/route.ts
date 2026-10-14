import { recordClientSearchStages } from "@/lib/server/client-search";
import { MAX_SEARCH_LENGTH } from "@/lib/search/client-search";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import EmailLog from "@/models/EmailLog";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() || "";
    if (search.length > MAX_SEARCH_LENGTH) return NextResponse.json({ error: "Search is too long" }, { status: 400 });
    const clientId = searchParams.get("clientId");
    const type = searchParams.get("type");
    const query: Record<string, unknown> = {};
    if (clientId) query.clientId = clientId;
    if (type && type !== "all") query.type = type;
    if (searchParams.get("count") === "1") {
      const count = await EmailLog.countDocuments(query);
      return NextResponse.json({ count });
    }
    const stages = await recordClientSearchStages(search, ["clientId"], ["subject", "clientName", "to", "financialYear"]);
    const paged = searchParams.get("paged") === "1";
    const offsetValue = Number(searchParams.get("offset") || 0);
    const offset = paged && Number.isFinite(offsetValue) ? Math.max(0, Math.floor(offsetValue)) : 0;
    const logs = await EmailLog.aggregate([{ $match: query }, ...stages, { $sort: { sentAt: -1, _id: -1 } }, { $skip: offset }, { $limit: paged ? 201 : 200 }]);
    if (!paged) return NextResponse.json(logs);
    const hasMore = logs.length > 200;
    return NextResponse.json({ items: logs.slice(0, 200), hasMore, nextOffset: hasMore ? offset + 200 : null });
  } catch (error) {
    console.error("GET /api/email-log:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const body = await req.json();
    const log = await EmailLog.create(body);
    return NextResponse.json(log, { status: 201 });
  } catch (error) {
    console.error("POST /api/email-log:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE ?ids=id1,id2,id3  OR  ?all=true  OR  ?type=payment_reminder
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
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
  } catch (error) {
    console.error("DELETE /api/email-log:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
