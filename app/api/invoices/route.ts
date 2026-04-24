import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Invoice from "@/models/Invoice";

const cleanInvoicePayload = (body: Record<string, unknown>) => ({
  clientId: String(body.clientId || "").trim(),
  financialYear: String(body.financialYear || "").trim(),
  invoiceType: body.invoiceType === "sale" || body.invoiceType === "purchase" ? body.invoiceType : undefined,
  receivedVia: body.receivedVia === "hardcopy" || body.receivedVia === "mail" || body.receivedVia === "whatsapp" ? body.receivedVia : undefined,
  fromDate: body.fromDate,
  toDate: body.toDate,
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
    const invoices = await Invoice.find(query).sort({ fromDate: -1 });
    return NextResponse.json(invoices);
  } catch (error) {
    console.error("GET /api/invoices:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const body = await req.json();
    const invoice = await Invoice.create(cleanInvoicePayload(body));
    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    console.error("POST /api/invoices:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
