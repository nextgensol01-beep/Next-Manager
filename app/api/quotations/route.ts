import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Quotation from "@/models/Quotation";
import QuotationRevision from "@/models/QuotationRevision";
import { calculateQuotationGrandTotal, calculateQuotationItems } from "@/lib/quotationRules";
import { quotationCreateSchema, quotationListQuerySchema, validationErrorMessage } from "@/lib/quotationValidation";
import { expireStaleQuotations } from "@/lib/quotationWorkflow";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// GET /api/quotations — list with filters
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const { searchParams } = new URL(req.url);
  const parsedQuery = quotationListQuerySchema.safeParse({
    status: searchParams.get("status") ?? undefined,
    financialYear: searchParams.get("financialYear") ?? undefined,
    search: searchParams.get("search") ?? undefined,
  });
  if (!parsedQuery.success) {
    return NextResponse.json({ error: validationErrorMessage(parsedQuery.error) }, { status: 400 });
  }
  const { status, financialYear, search } = parsedQuery.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (status === "awaitingResponse") filter.status = { $in: ["Finalized", "Sent"] };
  else if (status && status !== "all") filter.status = status;
  if (financialYear && financialYear !== "all") filter.financialYear = financialYear;
  if (search) {
    const safeSearch = escapeRegex(search);
    filter.$or = [
      { clientName: { $regex: safeSearch, $options: "i" } },
      { quotationNumber: { $regex: safeSearch, $options: "i" } },
      { financialYear: { $regex: safeSearch, $options: "i" } },
      { status: { $regex: safeSearch, $options: "i" } },
    ];
  }

  await expireStaleQuotations();

  const quotations = await Quotation.find(filter).sort({ updatedAt: -1 }).lean();

  // Attach grand totals from latest revision
  const ids = quotations.map((q) => String(q._id));
  const revisions = await QuotationRevision.find({ quotationId: { $in: ids } })
    .sort({ revisionNumber: -1 })
    .lean();

  // Build map: quotationId → latest revision
  const latestRevMap: Record<string, (typeof revisions)[0]> = {};
  for (const rev of revisions) {
    if (!latestRevMap[rev.quotationId]) {
      latestRevMap[rev.quotationId] = rev;
    }
  }

  const result = quotations.map((q) => {
    const rev = latestRevMap[String(q._id)];
    return {
      ...q,
      grandTotal: rev?.grandTotal ?? 0,
      itemCount: rev?.items?.length ?? 0,
    };
  });

  return NextResponse.json(result);
}

// POST /api/quotations — create new draft
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const parsedBody = quotationCreateSchema.safeParse(await req.json());
  if (!parsedBody.success) {
    return NextResponse.json({ error: validationErrorMessage(parsedBody.error) }, { status: 400 });
  }
  const {
    clientName,
    clientId,
    clientAddress,
    clientGst,
    clientState,
    financialYear,
    items,
    consultationCharges,
    consultationGstPercent,
    governmentFees,
    notes,
    validityDays,
  } = parsedBody.data;

  const { calculatedItems, itemsSubtotal, itemsGst } = calculateQuotationItems(items);
  const { consultationGstAmount, grandTotal } = calculateQuotationGrandTotal({
    itemsSubtotal,
    itemsGst,
    consultationCharges,
    consultationGstPercent,
    governmentFees,
  });

  const quotation = await Quotation.create({
    clientName: clientName.trim(),
    clientId: clientId || "",
    clientAddress: clientAddress || "",
    clientGst: clientGst || "",
    clientState: clientState || "",
    financialYear,
    status: "Draft",
    currentRevisionNumber: 0,
    validityDays,
    activities: [{ timestamp: new Date(), action: "Quotation created", detail: `Client: ${clientName}` }],
  });

  await QuotationRevision.create({
    quotationId: String(quotation._id),
    revisionNumber: 0,
    items: calculatedItems,
    consultationCharges,
    consultationGstPercent,
    consultationGstAmount,
    governmentFees,
    itemsSubtotal,
    itemsGst,
    grandTotal,
    notes,
    validityDays,
    isFinalised: false,
  });

  const obj = quotation.toObject();
  return NextResponse.json({ ...obj, _id: String(obj._id) }, { status: 201 });
}
