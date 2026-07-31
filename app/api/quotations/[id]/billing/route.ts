import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Billing from "@/models/Billing";
import Client from "@/models/Client";
import Quotation from "@/models/Quotation";
import QuotationRevision from "@/models/QuotationRevision";
import { mongoObjectIdSchema, validationErrorMessage } from "@/lib/quotationValidation";
import { syncAnnualReturnStatus } from "@/lib/server/annual-return-status-service";

function quotationTargetBreakdown(items: Array<{
  category?: string;
  type?: string;
  quantity?: number;
  rate?: number;
  gstPercent?: number;
}>) {
  return items
    .map((item) => {
      const categoryMatch = String(item.category || "").match(/(?:CAT(?:EGORY)?[- ]?)(IV|III|II|I|[1-4])/i);
      const romanToId: Record<string, string> = { I: "1", II: "2", III: "3", IV: "4" };
      const rawCategory = categoryMatch?.[1]?.toUpperCase() || "";
      const categoryId = romanToId[rawCategory] || rawCategory;
      const quantity = Number(item.quantity || 0);
      const rate = Number(item.rate || 0);
      const gstPercent = Number(item.gstPercent || 0);
      const taxableAmount = quantity * rate;
      const gstAmount = taxableAmount * (gstPercent / 100);
      return {
        categoryId,
        categoryLabel: categoryId ? `Category ${romanToId[rawCategory] ? rawCategory : categoryId}` : "Quotation item",
        type: String(item.type || "").toUpperCase() === "EOL" ? "EOL" as const : "RECYCLING" as const,
        quantity,
        rate,
        taxableAmount,
        gstPercent,
        gstAmount,
        totalAmount: taxableAmount + gstAmount,
        rateSource: "manual" as const,
      };
    })
    .filter((row) => row.categoryId && row.quantity > 0 && row.totalAmount > 0);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const { id } = await params;
  const parsedId = mongoObjectIdSchema.safeParse(id);
  if (!parsedId.success) return NextResponse.json({ error: validationErrorMessage(parsedId.error) }, { status: 400 });

  const quotation = await Quotation.findById(id).lean();
  if (!quotation) return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
  const client = quotation.clientId ? await Client.findOne({ clientId: quotation.clientId }).select("clientId companyName").lean() : null;
  const billing = await Billing.findOne({ sourceQuotationIds: id }).select("_id clientId financialYear").lean();

  return NextResponse.json({
    eligible: quotation.status === "Accepted" && Boolean(client) && !billing,
    accepted: quotation.status === "Accepted",
    clientSaved: Boolean(client),
    alreadyConverted: Boolean(billing),
    billingId: billing ? String((billing as { _id: unknown })._id) : null,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const { id } = await params;
  const parsedId = mongoObjectIdSchema.safeParse(id);
  if (!parsedId.success) return NextResponse.json({ error: validationErrorMessage(parsedId.error) }, { status: 400 });

  const quotation = await Quotation.findById(id);
  if (!quotation) return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
  if (quotation.status !== "Accepted") {
    return NextResponse.json({ error: "Only accepted quotations can create billing" }, { status: 409 });
  }
  if (!quotation.clientId) {
    return NextResponse.json({ error: "Link this quotation to a saved client before creating billing" }, { status: 409 });
  }
  const client = await Client.findOne({ clientId: quotation.clientId }).select("clientId").lean();
  if (!client) {
    return NextResponse.json({ error: "The linked client is not saved in the database" }, { status: 409 });
  }

  const duplicate = await Billing.findOne({ sourceQuotationIds: id }).select("_id").lean();
  if (duplicate) {
    return NextResponse.json({ error: "Billing has already been created from this quotation", billingId: String((duplicate as { _id: unknown })._id) }, { status: 409 });
  }

  const revision = await QuotationRevision.findOne({
    quotationId: id,
    revisionNumber: quotation.currentRevisionNumber,
    isFinalised: true,
  }).lean();
  if (!revision) return NextResponse.json({ error: "Accepted quotation revision is not finalised" }, { status: 409 });

  const dueDateInput = await req.json().catch(() => ({})) as { dueDate?: string | null };
  const dueDate = dueDateInput.dueDate ? new Date(dueDateInput.dueDate) : null;
  const targetBreakdown = quotationTargetBreakdown(revision.items);
  const targetCharges = Number(revision.itemsSubtotal || 0) + Number(revision.itemsGst || 0);
  const consultancyCharges = Number(revision.consultationCharges || 0) + Number(revision.consultationGstAmount || 0);
  const govtCharges = Number(revision.governmentFees || 0);
  const sourceNote = `Accepted quotation ${quotation.quotationNumber} (Rev ${revision.revisionNumber})`;

  const existing = await Billing.findOne({ clientId: quotation.clientId, financialYear: quotation.financialYear });
  let billing;
  let created = false;
  if (existing) {
    existing.govtCharges = Number(existing.govtCharges || 0) + govtCharges;
    existing.consultancyCharges = Number(existing.consultancyCharges || 0) + consultancyCharges;
    existing.targetCharges = Number(existing.targetCharges || 0) + targetCharges;
    existing.targetBreakdown = [...(existing.targetBreakdown || []), ...targetBreakdown];
    existing.sourceQuotationIds = [...(existing.sourceQuotationIds || []), id];
    existing.sourceQuotationNumbers = [...(existing.sourceQuotationNumbers || []), quotation.quotationNumber];
    existing.notes = [existing.notes, sourceNote].filter(Boolean).join("\n");
    if (dueDate && !existing.dueDate) existing.dueDate = dueDate;
    billing = await existing.save();
  } else {
    created = true;
    billing = await Billing.create({
      clientId: quotation.clientId,
      financialYear: quotation.financialYear,
      govtCharges,
      consultancyCharges,
      targetCharges,
      otherCharges: 0,
      totalPaid: 0,
      dueDate,
      targetBreakdown,
      notes: sourceNote,
      sourceQuotationIds: [id],
      sourceQuotationNumbers: [quotation.quotationNumber],
    });
  }

  quotation.activities.push({
    timestamp: new Date(),
    action: "Billing created",
    detail: `${created ? "Created" : "Added to"} billing for ${quotation.financialYear}`,
  });
  await quotation.save();
  await syncAnnualReturnStatus(quotation.clientId, quotation.financialYear);

  return NextResponse.json({ billingId: billing._id, created, billing }, { status: created ? 201 : 200 });
}
