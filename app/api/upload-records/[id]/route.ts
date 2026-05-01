import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import UploadRecord from "@/models/UploadRecord";
import DeletedRecord from "@/models/DeletedRecord";
import mongoose from "mongoose";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const _id = new mongoose.Types.ObjectId(id);
    const rec = await UploadRecord.collection.findOne({ _id });
    if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const total = (Number(rec.cat1) || 0) + (Number(rec.cat2) || 0) + (Number(rec.cat3) || 0) + (Number(rec.cat4) || 0);
    const typeLabel = rec.uploadType === "purchase" ? "Purchase" : "Sale";
    await DeletedRecord.create({
      recordType: "uploadRecord",
      recordId: id,
      label: `Upload Record - ${rec.clientId}`,
      subLabel: `FY ${rec.financialYear} - ${typeLabel} - Total ${total.toLocaleString("en-IN")}`,
      data: rec,
    });
    await UploadRecord.collection.deleteOne({ _id });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/upload-records/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
