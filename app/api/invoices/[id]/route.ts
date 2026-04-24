import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Invoice from "@/models/Invoice";
import DeletedRecord from "@/models/DeletedRecord";

const cleanInvoicePayload = (body: Record<string, unknown>) => ({
  clientId: String(body.clientId || "").trim(),
  financialYear: String(body.financialYear || "").trim(),
  invoiceType: body.invoiceType === "sale" || body.invoiceType === "purchase" ? body.invoiceType : undefined,
  receivedVia: body.receivedVia === "hardcopy" || body.receivedVia === "mail" || body.receivedVia === "whatsapp" ? body.receivedVia : undefined,
  fromDate: body.fromDate,
  toDate: body.toDate,
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const { id } = await params;
    const body = await req.json();
    const invoice = await Invoice.findByIdAndUpdate(
      id,
      cleanInvoicePayload(body),
      { new: true, runValidators: true }
    );
    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(invoice);
  } catch (error) {
    console.error("PUT /api/invoices/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

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
      label: `Invoice - ${inv.clientId}`,
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
