import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import UploadRecord from "@/models/UploadRecord";
import { syncAnnualReturnStatus } from "@/lib/server/annual-return-status-service";
import { recordActivityEvent } from "@/lib/server/activity-events";

const cleanUploadPayload = (body: Record<string, unknown>) => ({
  clientId: String(body.clientId || "").trim(),
  financialYear: String(body.financialYear || "").trim(),
  uploadType: body.uploadType === "purchase" ? "purchase" : "sale",
  cat1: Math.max(0, Number(body.cat1) || 0),
  cat2: Math.max(0, Number(body.cat2) || 0),
  cat3: Math.max(0, Number(body.cat3) || 0),
  cat4: Math.max(0, Number(body.cat4) || 0),
  invoiceCount: Math.max(0, Number(body.invoiceCount) || 0),
});

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
    const records = await UploadRecord.collection.find(query).sort({ createdAt: -1 }).toArray();
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
    const now = new Date();
    const payload = {
      ...cleanUploadPayload(body),
      createdAt: now,
      updatedAt: now,
    };
    const result = await UploadRecord.collection.insertOne(payload);
    const record = await UploadRecord.collection.findOne({ _id: result.insertedId });
    await syncAnnualReturnStatus(payload.clientId, payload.financialYear);
    const totalQuantity = payload.cat1 + payload.cat2 + payload.cat3 + payload.cat4;
    await recordActivityEvent({
      clientId: payload.clientId,
      category: "compliance",
      type: "cpcb_upload_recorded",
      label: "CPCB Upload Recorded",
      detail: `${payload.uploadType === "purchase" ? "Purchase" : "Sale"} data · ${totalQuantity.toLocaleString("en-IN")} MT`,
      color: "violet",
      badge: `${totalQuantity.toLocaleString("en-IN")} MT`,
      financialYear: payload.financialYear,
      entityId: String(result.insertedId),
      entityType: "upload",
      relatedEntityIds: [String(result.insertedId)],
    }, session);
    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error("POST /api/upload-records:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
