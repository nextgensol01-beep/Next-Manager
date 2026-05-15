import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { normalizeBillingBody } from "@/lib/billing-utils";
import { connectDB } from "@/lib/mongoose";
import Billing from "@/models/Billing";
import DeletedRecord from "@/models/DeletedRecord";

// PATCH — lightweight update for invoice status only
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const body = await req.json() as Record<string, unknown>;
    const { id } = await params;
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.invoiceCreated === "boolean") update.invoiceCreated = body.invoiceCreated;
    if (typeof body.invoiceNumber === "string") update.invoiceNumber = body.invoiceNumber.trim();
    if (body.invoiceDate !== undefined) {
      update.invoiceDate = body.invoiceDate ? new Date(String(body.invoiceDate)) : null;
    }
    if (body.invoiceAmount !== undefined) {
      update.invoiceAmount = body.invoiceAmount !== null && body.invoiceAmount !== "" ? Number(body.invoiceAmount) : null;
    }
    const record = await Billing.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(record);
  } catch (error) {
    console.error("PATCH /api/billing/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const body = normalizeBillingBody(await req.json());
    const { id } = await params;
    const record = await Billing.findByIdAndUpdate(id, { ...body, updatedAt: new Date() }, { new: true, runValidators: true });
    if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(record);
  } catch (error) {
    console.error("PUT /api/billing/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const { id } = await params;
    const billing = await Billing.findById(id);
    if (!billing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await DeletedRecord.create({
      recordType: "billing",
      recordId: id,
      label: `Billing — ${billing.clientId}`,
      subLabel: `FY ${billing.financialYear} · ₹${billing.totalAmount?.toLocaleString("en-IN") || 0}`,
      data: billing.toObject(),
    });
    await Billing.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/billing/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
