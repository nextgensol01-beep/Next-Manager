import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import CreditTransaction from "@/models/CreditTransaction";
import DeletedRecord from "@/models/DeletedRecord";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const { id } = await params;
  const tx = await CreditTransaction.findById(id);
  if (!tx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await DeletedRecord.create({
    recordType: "creditTransaction",
    recordId: id,
    label: `${tx.fromClientId} → ${tx.toClientId}`,
    subLabel: `FY ${tx.financialYear} · ₹${tx.totalAmount?.toLocaleString("en-IN") || 0}`,
    data: tx.toObject(),
  });
  await CreditTransaction.findByIdAndDelete(id);
  return NextResponse.json({ success: true });
}
