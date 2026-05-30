import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Quotation from "@/models/Quotation";
import QuotationRevision from "@/models/QuotationRevision";
import {
  calculateQuotationGrandTotal,
  calculateQuotationItems,
  canEditQuotation,
} from "@/lib/quotationRules";
import { mongoObjectIdSchema, quotationPatchSchema, validationErrorMessage } from "@/lib/quotationValidation";
import {
  QuotationWorkflowError,
  applyQuotationStatusChange,
  expireStaleQuotations,
} from "@/lib/quotationWorkflow";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const { id } = await params;
  const parsedId = mongoObjectIdSchema.safeParse(id);
  if (!parsedId.success) return NextResponse.json({ error: validationErrorMessage(parsedId.error) }, { status: 400 });

  await expireStaleQuotations({ _id: id });
  const quotation = await Quotation.findById(id).lean();
  if (!quotation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const revisions = await QuotationRevision.find({ quotationId: id })
    .sort({ revisionNumber: 1 })
    .lean();

  return NextResponse.json({ ...quotation, revisions });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const { id } = await params;
  const parsedId = mongoObjectIdSchema.safeParse(id);
  if (!parsedId.success) return NextResponse.json({ error: validationErrorMessage(parsedId.error) }, { status: 400 });

  const quotation = await Quotation.findById(id);
  if (!quotation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsedBody = quotationPatchSchema.safeParse(await req.json());
  if (!parsedBody.success) {
    return NextResponse.json({ error: validationErrorMessage(parsedBody.error) }, { status: 400 });
  }
  const body = parsedBody.data;
  const {
    status,
    clientName,
    clientId,
    clientAddress,
    clientGst,
    clientState,
    financialYear,
    validityDays,
    items,
    consultationCharges,
    consultationGstPercent,
    governmentFees,
    notes,
    activityEntry,
  } = body;

  const hasHeaderEdits = (
    clientName !== undefined ||
    clientId !== undefined ||
    clientAddress !== undefined ||
    clientGst !== undefined ||
    clientState !== undefined ||
    financialYear !== undefined
  );
  const hasRevisionEdits = (
    items !== undefined ||
    notes !== undefined ||
    validityDays !== undefined ||
    consultationCharges !== undefined ||
    consultationGstPercent !== undefined ||
    governmentFees !== undefined
  );

  if (status && status !== quotation.status) {
    try {
      applyQuotationStatusChange(quotation, status);
    } catch (error) {
      if (error instanceof QuotationWorkflowError) {
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
      }
      throw error;
    }
  }

  if ((hasHeaderEdits || hasRevisionEdits) && !canEditQuotation(quotation.status)) {
    return NextResponse.json({ error: "Only draft quotations can be edited" }, { status: 409 });
  }

  if (clientName !== undefined) quotation.clientName = clientName;
  if (clientId !== undefined) quotation.clientId = clientId;
  if (clientAddress !== undefined) quotation.clientAddress = clientAddress;
  if (clientGst !== undefined) quotation.clientGst = clientGst;
  if (clientState !== undefined) quotation.clientState = clientState;
  if (financialYear !== undefined) quotation.financialYear = financialYear;
  if (validityDays !== undefined) quotation.validityDays = validityDays;

  if (activityEntry) {
    quotation.activities.push({ timestamp: new Date(), ...activityEntry });
  }

  if (hasRevisionEdits) {
    const currentRev = await QuotationRevision.findOne({
      quotationId: id,
      revisionNumber: quotation.currentRevisionNumber,
      isFinalised: false,
    });

    if (!currentRev) {
      return NextResponse.json({ error: "Current revision is locked. Create a new revision first." }, { status: 409 });
    }

    if (items !== undefined) {
      const { calculatedItems, itemsSubtotal, itemsGst } = calculateQuotationItems(items);
      const cc = Number(consultationCharges ?? currentRev.consultationCharges);
      const ccPct = Number(consultationGstPercent ?? currentRev.consultationGstPercent);
      const gf = Number(governmentFees ?? currentRev.governmentFees);
      const { consultationGstAmount, grandTotal } = calculateQuotationGrandTotal({
        itemsSubtotal,
        itemsGst,
        consultationCharges: cc,
        consultationGstPercent: ccPct,
        governmentFees: gf,
      });

      currentRev.items = calculatedItems;
      currentRev.itemsSubtotal = itemsSubtotal;
      currentRev.itemsGst = itemsGst;
      currentRev.consultationCharges = cc;
      currentRev.consultationGstPercent = ccPct;
      currentRev.consultationGstAmount = consultationGstAmount;
      currentRev.governmentFees = gf;
      currentRev.grandTotal = grandTotal;
    } else if (consultationCharges !== undefined || consultationGstPercent !== undefined || governmentFees !== undefined) {
      const cc = Number(consultationCharges ?? currentRev.consultationCharges);
      const ccPct = Number(consultationGstPercent ?? currentRev.consultationGstPercent);
      const gf = Number(governmentFees ?? currentRev.governmentFees);
      const { consultationGstAmount, grandTotal } = calculateQuotationGrandTotal({
        itemsSubtotal: currentRev.itemsSubtotal,
        itemsGst: currentRev.itemsGst,
        consultationCharges: cc,
        consultationGstPercent: ccPct,
        governmentFees: gf,
      });

      currentRev.consultationCharges = cc;
      currentRev.consultationGstPercent = ccPct;
      currentRev.consultationGstAmount = consultationGstAmount;
      currentRev.governmentFees = gf;
      currentRev.grandTotal = grandTotal;
    }

    if (notes !== undefined) currentRev.notes = notes;
    if (validityDays !== undefined) currentRev.validityDays = validityDays;
    await currentRev.save();
  }

  await quotation.save();
  const obj = quotation.toObject();
  return NextResponse.json({ ...obj, _id: String(obj._id) });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const { id } = await params;
  const parsedId = mongoObjectIdSchema.safeParse(id);
  if (!parsedId.success) return NextResponse.json({ error: validationErrorMessage(parsedId.error) }, { status: 400 });

  await Quotation.findByIdAndDelete(id);
  await QuotationRevision.deleteMany({ quotationId: id });

  return NextResponse.json({ success: true });
}
