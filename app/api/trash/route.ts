import { buildSearchFieldConditions } from "@/lib/server/client-search";
import { MAX_SEARCH_LENGTH } from "@/lib/search/client-search";
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
    const search = searchParams.get("search")?.trim() || "";
    if (search.length > MAX_SEARCH_LENGTH) return NextResponse.json({ error: "Search is too long" }, { status: 400 });
    const type = searchParams.get("type");
    const query: Record<string, unknown> = type && type !== "all" ? { recordType: type } : {};
    if (search) query.$or = buildSearchFieldConditions(["label", "subLabel"], search);
    if (searchParams.get("count") === "1") {
      const count = await DeletedRecord.countDocuments(query);
      return NextResponse.json({ count });
    }
    const paged = searchParams.get("paged") === "1";
    const offsetValue = Number(searchParams.get("offset") || 0);
    const offset = paged && Number.isFinite(offsetValue) ? Math.max(0, Math.floor(offsetValue)) : 0;
    const records = await DeletedRecord.find(query).sort({ deletedAt: -1, _id: -1 }).skip(offset).limit(paged ? 201 : 200).lean();
    const access = await clientCredentialAccess(session);
    const items = records.slice(0, 200).map((record) => {
      if (record.recordType !== "client" || !record.data?.client) return record;
      return { ...record, data: { ...record.data, client: access.read(record.data.client) } };
    });
    if (!paged) return NextResponse.json(items);
    const hasMore = records.length > 200;
    return NextResponse.json({ items, hasMore, nextOffset: hasMore ? offset + 200 : null });
  } catch (error) {
    console.error("GET /api/trash:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
