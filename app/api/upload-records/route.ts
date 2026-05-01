import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import UploadRecord from "@/models/UploadRecord";

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
    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error("POST /api/upload-records:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
