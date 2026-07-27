import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Invoice from "@/models/Invoice";
import Client from "@/models/Client";
import { syncAnnualReturnStatus } from "@/lib/server/annual-return-status-service";

const cleanInvoicePayload = (body: Record<string, unknown>) => ({
  clientId: String(body.clientId || "").trim(),
  financialYear: String(body.financialYear || "").trim(),
  invoiceType: body.invoiceType === "sale" || body.invoiceType === "purchase" ? body.invoiceType : undefined,
  status: (
    body.status === "Pending" ||
    body.status === "Received" ||
    body.status === "Partial / Issue" ||
    body.status === "Nil / No Invoice"
  ) ? body.status : "Received",
  receivedVia: (
    body.receivedVia === "hardcopy" ||
    body.receivedVia === "mail" ||
    body.receivedVia === "whatsapp" ||
    body.receivedVia === "excel" ||
    body.receivedVia === "other"
  ) ? body.receivedVia : undefined,
  remarks: typeof body.remarks === "string" ? body.remarks.trim() : "",
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
    const search = String(searchParams.get("search") || "").trim();
    const query: Record<string, unknown> = {};
    if (clientId) query.clientId = clientId;
    if (fy) query.financialYear = fy;

    if (!clientId && search) {
      const matchingClients = await Client.find({
        $or: [
          { clientId: { $regex: search, $options: "i" } },
          { companyName: { $regex: search, $options: "i" } },
        ],
      }).select("clientId").lean() as Array<{ clientId?: string }>;
      const matchingClientIds = matchingClients.map((client) => client.clientId).filter(Boolean);
      query.clientId = { $in: matchingClientIds };
    }

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
    await syncAnnualReturnStatus(invoice.clientId, invoice.financialYear);
    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    console.error("POST /api/invoices:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
