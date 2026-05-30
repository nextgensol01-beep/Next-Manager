import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Quotation from "@/models/Quotation";
import QuotationRevision from "@/models/QuotationRevision";
import { canCreateQuotationRevision } from "@/lib/quotationRules";
import { mongoObjectIdSchema, validationErrorMessage } from "@/lib/quotationValidation";

// POST /api/quotations/[id]/create-revision
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const { id } = await params;
  const parsedId = mongoObjectIdSchema.safeParse(id);
  if (!parsedId.success) return NextResponse.json({ error: validationErrorMessage(parsedId.error) }, { status: 400 });

  const quotation = await Quotation.findById(id);
  if (!quotation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!canCreateQuotationRevision(quotation.status)) {
    return NextResponse.json(
      { error: `Cannot create a revision while quotation is ${quotation.status}` },
      { status: 409 }
    );
  }

  // Find latest revision to fork from
  const sourceRevision = await QuotationRevision.findOne({
    quotationId: id,
    revisionNumber: quotation.currentRevisionNumber,
  }).lean();

  if (!sourceRevision) {
    return NextResponse.json({ error: "Source revision not found" }, { status: 404 });
  }
  if (!sourceRevision.isFinalised) {
    return NextResponse.json({ error: "Current revision is already editable" }, { status: 409 });
  }

  const newRevisionNumber = quotation.currentRevisionNumber + 1;

  // Create new editable revision — cloned from source
  const newRevision = await QuotationRevision.create({
    quotationId: id,
    revisionNumber: newRevisionNumber,
    items: sourceRevision.items,
    consultationCharges: sourceRevision.consultationCharges,
    consultationGstPercent: sourceRevision.consultationGstPercent,
    consultationGstAmount: sourceRevision.consultationGstAmount,
    governmentFees: sourceRevision.governmentFees,
    itemsSubtotal: sourceRevision.itemsSubtotal,
    itemsGst: sourceRevision.itemsGst,
    grandTotal: sourceRevision.grandTotal,
    notes: sourceRevision.notes,
    validityDays: sourceRevision.validityDays,
    isFinalised: false,
  });

  quotation.currentRevisionNumber = newRevisionNumber;
  quotation.status = "Draft"; // Back to draft for editing
  quotation.set({ validTill: null, sentAt: null });
  quotation.activities.push({
    timestamp: new Date(),
    action: `Rev ${newRevisionNumber} created`,
    detail: `Forked from Rev ${sourceRevision.revisionNumber}`,
  });

  await quotation.save();

  return NextResponse.json({
    revisionNumber: newRevisionNumber,
    revisionId: newRevision._id,
    status: "Draft",
  });
}
