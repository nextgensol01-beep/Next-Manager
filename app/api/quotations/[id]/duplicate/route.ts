import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Quotation from "@/models/Quotation";
import QuotationRevision from "@/models/QuotationRevision";
import { mongoObjectIdSchema, validationErrorMessage } from "@/lib/quotationValidation";

// POST /api/quotations/[id]/duplicate
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const { id } = await params;
  const parsedId = mongoObjectIdSchema.safeParse(id);
  if (!parsedId.success) return NextResponse.json({ error: validationErrorMessage(parsedId.error) }, { status: 400 });

  const source = await Quotation.findById(id).lean();
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sourceRev = await QuotationRevision.findOne({
    quotationId: id,
    revisionNumber: source.currentRevisionNumber,
  }).lean();

  const newQuotation = await Quotation.create({
    clientId: source.clientId || "",
    clientName: source.clientName,
    clientAddress: source.clientAddress || "",
    clientGst: source.clientGst || "",
    clientState: source.clientState || "",
    financialYear: source.financialYear,
    status: "Draft",
    currentRevisionNumber: 0,
    validityDays: source.validityDays,
    activities: [{ timestamp: new Date(), action: "Quotation duplicated", detail: `From ${source.quotationNumber || id}` }],
  });

  await QuotationRevision.create({
    quotationId: String(newQuotation._id),
    revisionNumber: 0,
    items: sourceRev?.items ?? [],
    consultationCharges: sourceRev?.consultationCharges ?? 0,
    consultationGstPercent: sourceRev?.consultationGstPercent ?? 18,
    consultationGstAmount: sourceRev?.consultationGstAmount ?? 0,
    governmentFees: sourceRev?.governmentFees ?? 0,
    itemsSubtotal: sourceRev?.itemsSubtotal ?? 0,
    itemsGst: sourceRev?.itemsGst ?? 0,
    grandTotal: sourceRev?.grandTotal ?? 0,
    notes: sourceRev?.notes ?? "",
    validityDays: sourceRev?.validityDays ?? 30,
    isFinalised: false,
  });

  return NextResponse.json({ _id: newQuotation._id }, { status: 201 });
}
