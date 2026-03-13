import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import AnnualReturn from "@/models/AnnualReturn";
import DeletedRecord from "@/models/DeletedRecord";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const body = await req.json();
  const { id } = await params;
  const record = await AnnualReturn.findByIdAndUpdate(id, body, { new: true });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(record);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const { id } = await params;
  const rec = await AnnualReturn.findById(id);
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await DeletedRecord.create({
    recordType: "annualReturn",
    recordId: id,
    label: `Annual Return — ${rec.clientId}`,
    subLabel: `FY ${rec.financialYear} · ${rec.status}`,
    data: rec.toObject(),
  });
  await AnnualReturn.findByIdAndDelete(id);
  return NextResponse.json({ success: true });
}
