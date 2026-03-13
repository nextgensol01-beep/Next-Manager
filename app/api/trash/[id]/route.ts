import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import DeletedRecord from "@/models/DeletedRecord";
import mongoose from "mongoose";
import Client from "@/models/Client";
import Contact from "@/models/Contact";
import CreditTransaction from "@/models/CreditTransaction";
import FinancialYear from "@/models/FinancialYear";
import Billing from "@/models/Billing";
import Payment from "@/models/Payment";
import AnnualReturn from "@/models/AnnualReturn";
import UploadRecord from "@/models/UploadRecord";
import Invoice from "@/models/Invoice";

function getModel(type: string): mongoose.Model<any> | null {
  const map: Record<string, mongoose.Model<any>> = {
    client: Client, contact: Contact, creditTransaction: CreditTransaction,
    financialYear: FinancialYear, billing: Billing, payment: Payment,
    annualReturn: AnnualReturn, uploadRecord: UploadRecord, invoice: Invoice,
  };
  return map[type] || null;
}

// Permanently delete one item from trash
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const { id } = await params;
  await DeletedRecord.findByIdAndDelete(id);
  return NextResponse.json({ success: true });
}

// Restore one item from trash back to its collection
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();

  const { id } = await params;
  const trashRecord = await DeletedRecord.findById(id);
  if (!trashRecord) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const Model = getModel(trashRecord.recordType);
  if (!Model) return NextResponse.json({ error: "Unknown record type" }, { status: 400 });

  try {
    // Strip internal trash metadata; restore original data
    const rawData = trashRecord.data as Record<string, unknown>;
    const { _id, __v, ...data } = rawData;
    void _id; void __v;
    await Model.create(data);
    await DeletedRecord.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Restore failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
