import { recordClientSearchStages } from "@/lib/server/client-search";
import { MAX_SEARCH_LENGTH } from "@/lib/search/client-search";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Invoice from "@/models/Invoice";
import { syncAnnualReturnStatus } from "@/lib/server/annual-return-status-service";
import { recordActivityEvent } from "@/lib/server/activity-events";

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

    if (search.length > MAX_SEARCH_LENGTH) return NextResponse.json({ error: "Search is too long" }, { status: 400 });
    const stages = await recordClientSearchStages(search, ["clientId"]);

    const invoices = await Invoice.aggregate([{ $match: query }, ...stages, { $sort: { fromDate: -1, _id: -1 } }]);
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
    await recordActivityEvent({
      clientId: invoice.clientId,
      category: "compliance",
      type: "invoice_tracking_updated",
      label: `${invoice.invoiceType === "purchase" ? "Purchase" : "Sale"} Invoice Tracking Updated`,
      detail: `${invoice.status || "Received"}${invoice.receivedVia ? ` · Received via ${invoice.receivedVia}` : ""}`,
      color: invoice.status === "Received" ? "emerald" : "amber",
      badge: invoice.status || "Received",
      financialYear: invoice.financialYear,
      entityId: String(invoice._id),
      entityType: "invoice",
      relatedEntityIds: [String(invoice._id)],
    }, session);
    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    console.error("POST /api/invoices:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
