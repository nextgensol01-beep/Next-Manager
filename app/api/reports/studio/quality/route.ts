import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/route-utils";
import { connectDB } from "@/lib/mongoose";
import Quotation from "@/models/Quotation";

export async function GET(request: NextRequest) {
  const guard = await requireSession();
  if (guard.response) return guard.response;
  const financialYear = request.nextUrl.searchParams.get("fy") || "";
  if (!/^\d{4}-\d{2}$/.test(financialYear)) return NextResponse.json({ error: "Select a valid financial year" }, { status: 400 });
  await connectDB();
  const records = await Quotation.find({ financialYear, $or: [{ clientId: "" }, { clientId: { $exists: false } }, { clientId: null }] })
    .select("quotationNumber clientName status").sort({ updatedAt: -1 }).lean();
  return NextResponse.json({ records: records.map((entry) => ({ id: String(entry._id), number: entry.quotationNumber, client: entry.clientName, status: entry.status })) }, { headers: { "Cache-Control": "no-store" } });
}
