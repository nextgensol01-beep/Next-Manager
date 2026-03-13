import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Payment from "@/models/Payment";
import DeletedRecord from "@/models/DeletedRecord";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const { id } = await params;
  const payment = await Payment.findById(id);
  if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await DeletedRecord.create({
    recordType: "payment",
    recordId: id,
    label: `Payment — ${payment.clientId}`,
    subLabel: `FY ${payment.financialYear} · ₹${payment.amountPaid?.toLocaleString("en-IN") || 0}`,
    data: payment.toObject(),
  });
  await Payment.findByIdAndDelete(id);
  return NextResponse.json({ success: true });
}
