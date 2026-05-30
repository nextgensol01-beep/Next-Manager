import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Quotation from "@/models/Quotation";
import QuotationRevision from "@/models/QuotationRevision";
import QuotationCounter from "@/models/QuotationCounter";
import { mongoObjectIdSchema, validationErrorMessage } from "@/lib/quotationValidation";

// POST /api/quotations/[id]/finalize
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const { id } = await params;
  const parsedId = mongoObjectIdSchema.safeParse(id);
  if (!parsedId.success) return NextResponse.json({ error: validationErrorMessage(parsedId.error) }, { status: 400 });

  const quotation = await Quotation.findById(id);
  if (!quotation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (quotation.status !== "Draft") {
    return NextResponse.json({ error: "Only draft quotations can be finalised" }, { status: 400 });
  }

  const currentRevision = await QuotationRevision.findOne({
    quotationId: id,
    revisionNumber: quotation.currentRevisionNumber,
    isFinalised: false,
  });

  if (!currentRevision) {
    return NextResponse.json({ error: "Current revision is locked. Create a new revision first." }, { status: 409 });
  }

  const hasChargeableValue = currentRevision.grandTotal > 0;
  const hasPositiveItem = currentRevision.items.some((item) => item.quantity > 0 && item.rate > 0);
  if (!hasChargeableValue || (!hasPositiveItem && currentRevision.consultationCharges <= 0 && currentRevision.governmentFees <= 0)) {
    return NextResponse.json({ error: "Add at least one chargeable item or fee before finalising" }, { status: 400 });
  }

  let quotationNumber = quotation.quotationNumber;
  if (!quotationNumber) {
    // Extract end-of-FY calendar year from FY string e.g. "2025-26" → "2026"
    // Uses the end year so QT numbers align with the FY notation (QT-2026-xxx for FY 2025-26)
    const fyParts = quotation.financialYear.split("-");
    const yearKey = fyParts.length === 2 ? `20${fyParts[1]}` : fyParts[0];

    // Atomic sequential number generation
    const counter = await QuotationCounter.findOneAndUpdate(
      { financialYear: yearKey },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    const seq = String(counter.seq).padStart(3, "0");
    quotationNumber = `QT-${yearKey}-${seq}`;
  }

  currentRevision.isFinalised = true;
  await currentRevision.save();

  // Set validity
  const validTill = new Date();
  validTill.setDate(validTill.getDate() + (quotation.validityDays || 30));

  quotation.quotationNumber = quotationNumber;
  quotation.status = "Finalized";
  quotation.validTill = validTill;
  quotation.activities.push({
    timestamp: new Date(),
    action: "Quotation finalised",
    detail: `${quotationNumber} · Rev ${quotation.currentRevisionNumber}`,
  });

  await quotation.save();

  return NextResponse.json({
    quotationNumber,
    status: "Finalized",
    validTill,
    revisionNumber: quotation.currentRevisionNumber,
  });
}
