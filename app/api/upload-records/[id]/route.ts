import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import UploadRecord from "@/models/UploadRecord";
import DeletedRecord from "@/models/DeletedRecord";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const { id } = await params;
    const rec = await UploadRecord.findById(id);
    if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const total = (rec.cat1||0)+(rec.cat2||0)+(rec.cat3||0)+(rec.cat4||0);
    await DeletedRecord.create({
      recordType: "uploadRecord",
      recordId: id,
      label: `Upload Record — ${rec.clientId}`,
      subLabel: `FY ${rec.financialYear} · Total ${total.toLocaleString("en-IN")}`,
      data: rec.toObject(),
    });
    await UploadRecord.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/upload-records/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
