import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Invoice from "@/models/Invoice";
import DeletedRecord from "@/models/DeletedRecord";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const { id } = await params;
    const inv = await Invoice.findById(id);
    if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await DeletedRecord.create({
      recordType: "invoice",
      recordId: id,
      label: `Invoice — ${inv.clientId}`,
      subLabel: `FY ${inv.financialYear}`,
      data: inv.toObject(),
    });
    await Invoice.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/invoices/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
